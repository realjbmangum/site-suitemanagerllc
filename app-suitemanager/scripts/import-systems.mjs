#!/usr/bin/env node
/**
 * Import the Systems & Technology matrix from the collection spreadsheet into
 * the `property_systems` table. This is what retires the Phase-0 Google Sheet.
 *
 * Expects the "Systems Detail" sheet (one row per property-system) with columns
 * (header names are case/space tolerant):
 *   Property | System Type | Vendor | Account # | Contact Name | Contact Phone |
 *   Contact Email | Monthly Cost | Contract End | Cancellation Notice | Status | Notes
 *
 *   npm run import:systems -- ./data/systems-matrix.xlsx            # remote D1
 *   npm run import:systems -- ./data/systems-matrix.xlsx --local    # local D1
 *
 * Properties are matched by name (case-insensitive), falling back to CHORUM
 * code. Rows whose property can't be matched are reported and skipped — nothing
 * is inserted for them. Re-running APPENDS (it does not dedupe), so import into a
 * clean table or clear property_systems first.
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import xlsx from 'xlsx';

const args = process.argv.slice(2);
const local = args.includes('--local');
const filePath = args.find((a) => !a.startsWith('--')) || 'data/systems-matrix.xlsx';

// Controlled service types (kept in sync with src/lib/systems.ts) + aliases so
// human-typed labels in the sheet map to canonical values.
const TYPE_ALIASES = {
  phone: 'phone', voice: 'phone', 'phone / voice': 'phone', 'phone/voice': 'phone', phones: 'phone',
  isp: 'isp', internet: 'isp', 'internet / isp': 'isp', 'internet/isp': 'isp', broadband: 'isp', circuit: 'isp',
  wifi: 'wifi_managed', 'wi-fi': 'wifi_managed', 'managed wifi': 'wifi_managed', 'managed wi-fi': 'wifi_managed', wifi_managed: 'wifi_managed',
  cable: 'cable_tv', tv: 'cable_tv', 'cable / tv': 'cable_tv', 'cable/tv': 'cable_tv', television: 'cable_tv', cable_tv: 'cable_tv',
  cameras: 'cameras', camera: 'cameras', cctv: 'cameras', 'security cameras': 'cameras', surveillance: 'cameras',
  alarm: 'alarm_fire', fire: 'alarm_fire', 'alarm & fire monitoring': 'alarm_fire', 'alarm/fire': 'alarm_fire', monitoring: 'alarm_fire', alarm_fire: 'alarm_fire',
  locks: 'door_locks', 'door locks': 'door_locks', onity: 'door_locks', ving: 'door_locks', door_locks: 'door_locks', keys: 'door_locks',
  pms: 'pms', chorum: 'pms', 'property mgmt system': 'pms', 'property management system': 'pms',
};
function normalizeType(raw) {
  if (!raw) return null;
  const k = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  return TYPE_ALIASES[k] || null;
}

function parseCents(raw) {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function genId(len = 21) {
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (const b of buf) s += ALPHABET[b % ALPHABET.length];
  return s;
}

function d1Json(sql) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'suitemanager-portal', local ? '--local' : '--remote', '--json', `--command=${sql}`],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  const parsed = JSON.parse(r.stdout);
  return (Array.isArray(parsed) ? parsed[0]?.results : parsed.results) || [];
}

// --- Look up properties + a creator user from the DB ---
const propRows = d1Json('SELECT id, name, code FROM properties WHERE active = 1');
const byName = new Map();
const byCode = new Map();
for (const p of propRows) {
  byName.set(String(p.name).trim().toLowerCase(), p.id);
  if (p.code) byCode.set(String(p.code).trim().toLowerCase(), p.id);
}
const userRows = d1Json("SELECT id FROM users WHERE role IN ('admin','strand') ORDER BY role DESC LIMIT 1");
const createdBy = userRows[0]?.id;
if (!createdBy) {
  console.error('No admin/strand user found to attribute rows to. Create one first.');
  process.exit(1);
}

// --- Read the sheet ---
const abs = path.resolve(filePath);
console.log(`Reading ${abs}…`);
const wb = xlsx.readFile(abs);
const sheetName = wb.SheetNames.find((n) => /detail/i.test(n)) || wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const records = xlsx.utils.sheet_to_json(sheet, { defval: null });

const pick = (row, ...keys) => {
  for (const k of Object.keys(row)) {
    const norm = k.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[#:]/g, '').trim();
    if (keys.includes(norm)) return row[k];
  }
  return null;
};

const escape = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const inserts = [];
const skipped = [];
let order = 0;
for (const row of records) {
  const propRaw = pick(row, 'property', 'hotel', 'property name');
  const typeRaw = pick(row, 'system type', 'type', 'service', 'service type');
  const vendor = pick(row, 'vendor', 'vendor name', 'provider');
  if (!propRaw && !vendor) continue; // blank line

  const pid = byName.get(String(propRaw || '').trim().toLowerCase()) || byCode.get(String(propRaw || '').trim().toLowerCase());
  const type = normalizeType(typeRaw);
  if (!pid) { skipped.push(`No property match: "${propRaw}"`); continue; }
  if (!type) { skipped.push(`Unknown system type "${typeRaw}" for "${propRaw}"`); continue; }
  if (!vendor) { skipped.push(`Missing vendor for "${propRaw}" / ${type}`); continue; }

  const statusRaw = String(pick(row, 'status') || 'active').trim().toLowerCase();
  const status = statusRaw.startsWith('cancel') ? 'cancelled' : 'active';

  const vals = [
    genId(), pid, type, String(vendor).trim(),
    pick(row, 'account', 'account number'),
    pick(row, 'contact name'),
    pick(row, 'contact phone', 'phone'),
    pick(row, 'contact email', 'email'),
    parseCents(pick(row, 'monthly cost', 'monthly', 'cost')),
    pick(row, 'contract end', 'contract', 'term end'),
    pick(row, 'cancellation notice', 'cancel notice', 'notice'),
    status,
    pick(row, 'notes', 'note'),
    order++,
    createdBy,
  ];
  inserts.push(
    `INSERT INTO property_systems
       (id, property_id, service_type, vendor_name, account_number, contact_name,
        contact_phone, contact_email, monthly_cost_cents, contract_end,
        cancel_notice, status, notes, sort_order, created_by)
     VALUES (${vals.map(escape).join(', ')});`
  );
}

console.log(`Parsed ${inserts.length} systems; ${skipped.length} skipped.`);
if (skipped.length) console.log('  - ' + skipped.join('\n  - '));
if (inserts.length === 0) { console.log('Nothing to import.'); process.exit(0); }

const dir = mkdtempSync(path.join(tmpdir(), 'import-systems-'));
const sqlFile = path.join(dir, 'import.sql');
writeFileSync(sqlFile, inserts.join('\n'));
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'suitemanager-portal', local ? '--local' : '--remote', `--file=${sqlFile}`],
  { stdio: 'inherit' }
);
rmSync(dir, { recursive: true, force: true });
if (result.status !== 0) { console.error('\nImport failed.'); process.exit(result.status || 1); }
console.log('\nImport complete.');
