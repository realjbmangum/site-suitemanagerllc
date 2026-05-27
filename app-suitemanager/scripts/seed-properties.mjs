#!/usr/bin/env node
/**
 * Seed (or refresh) the `properties` table from an Excel/CSV export.
 *
 * Defaults to `data/ASA Location Phone List 2026.xlsx`. Pass a different path
 * as the first arg.
 *
 *   npm run seed:properties                          # remote D1 (production)
 *   npm run seed:properties -- --local               # local D1 (dev)
 *   npm run seed:properties -- ./data/other.xlsx     # custom file
 *
 * Operations are UPSERT-by-`code`, so re-running is safe — it updates rows
 * but never duplicates. Properties present in the database but absent from
 * the file are left alone (we never delete from this script).
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import xlsx from 'xlsx';

const args = process.argv.slice(2);
const local = args.includes('--local');
const filePath =
  args.find((a) => !a.startsWith('--')) ||
  'data/ASA Location Phone List 2026-updated.xlsx';

// --- ID generation matching scripts/create-user.mjs alphabet ---
const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function genId(len = 16) {
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (const b of buf) s += ALPHABET[b % ALPHABET.length];
  return s;
}

// --- Address parser ---
// Handles the four shapes that actually appear in Chris's roster:
//   A. "street, city, ST zip"                       (well-formed)
//   B. "street, city ST zip"                        (missing comma before state)
//   C. "street, city, ST, zip"                      (extra comma between state+zip)
//   D. "street, city, zip"                          (state omitted — fixed in cleanRow)
function parseAddress(addr) {
  if (!addr) return {};
  let parts = String(addr).split(',').map((s) => s.trim()).filter(Boolean);

  let street = null, city = null, state = null, zip = null;
  const last = parts[parts.length - 1] || '';

  // A: last fragment is "ST zip" e.g. "NC 28546-6943"
  let m = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m) {
    state = m[1]; zip = m[2]; parts.pop();
  } else {
    // B: last fragment is "City ST zip" e.g. "Tulsa OK 74133"
    m = last.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (m) {
      city = m[1].trim(); state = m[2]; zip = m[3]; parts.pop();
    } else if (/^\d{5}(-\d{4})?$/.test(last)) {
      // C or D: last fragment is bare zip.
      zip = last; parts.pop();
      const prev = parts[parts.length - 1] || '';
      if (/^[A-Z]{2}$/.test(prev)) {
        // C: previous fragment is just the state ("AR")
        state = prev; parts.pop();
      } else {
        // City ST in one fragment e.g. "Waynesboro VA"
        const m2 = prev.match(/^(.+?)\s+([A-Z]{2})$/);
        if (m2) { city = m2[1].trim(); state = m2[2]; parts.pop(); }
        // else: state genuinely missing (D) — cleanRow will fill it.
      }
    }
  }

  if (!city && parts.length) city = parts.pop();
  if (parts.length) street = parts.join(', ');
  return { street, city, state, zip };
}

// --- Brand from email domain ---
function brandFromEmail(email) {
  if (!email) return null;
  const e = String(email).toLowerCase();
  if (e.endsWith('@affordablesuites.com')) return 'asa';
  if (e.endsWith('@affordablecorporatesuites.net')) return 'acs';
  return null;
}

// --- Manual cleanup of known issues ---
function cleanRow(raw) {
  // Name "Salibury" → "Salisbury" (typo in original sheet, kept in case it returns)
  if (raw.name && raw.name.toLowerCase() === 'salibury') raw.name = 'Salisbury';
  // Rocky Mount, NC — Chris's sheet has no state for this row.
  if (raw.name === 'Rocky Mount' && !raw.address_state) raw.address_state = 'NC';
  return raw;
}

// --- Read the workbook ---
const abs = path.resolve(filePath);
console.log(`Reading ${abs}…`);
const wb = xlsx.readFile(abs);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

// Find the header row — it has "Hotel" in column 0.
let headerIdx = -1;
for (let i = 0; i < rows.length; i++) {
  if (rows[i] && String(rows[i][0] || '').trim().toLowerCase() === 'hotel') {
    headerIdx = i;
    break;
  }
}
if (headerIdx === -1) {
  console.error('Could not find header row (expected "Hotel" in column A).');
  process.exit(1);
}

// Map header → column index (case/space tolerant).
const header = rows[headerIdx].map((h) =>
  String(h || '').trim().toLowerCase().replace(/\s+/g, ' ')
);
const col = (key) => header.indexOf(key);
const COL = {
  hotel: col('hotel'),
  owner: col('owner'),
  manager: col('manager'),
  chorum: col('chorum'),
  address: col('address'),
  rooms: col('rooms'),
  phone: col('phone #'),
  fax: col('fax #'),
  emergency: col('emergency cell #'),
  email: col('emails'),
};

// Collect property rows (skip blanks + the trailing total row).
const dataRows = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  const name = String(r[COL.hotel] || '').trim();
  if (!name) continue;
  if (name.toLowerCase() === 'total') continue;
  // Skip rows where Hotel is null and Rooms is the sum (last row)
  if (!r[COL.hotel] && r[COL.rooms]) continue;

  const email = r[COL.email] ? String(r[COL.email]).trim() : null;
  const code = r[COL.chorum] ? String(r[COL.chorum]).trim() : null;
  const addr = parseAddress(r[COL.address]);
  const rooms = r[COL.rooms];

  dataRows.push(
    cleanRow({
      name,
      code,
      brand: brandFromEmail(email),
      owner_group: r[COL.owner] ? String(r[COL.owner]).trim() : null,
      address_street: addr.street ?? null,
      address_city: addr.city ?? null,
      address_state: addr.state ?? null,
      address_zip: addr.zip ?? null,
      room_count: Number.isFinite(Number(rooms)) ? Number(rooms) : null,
      phone: r[COL.phone] ? String(r[COL.phone]).trim() : null,
      fax: r[COL.fax] ? String(r[COL.fax]).trim() : null,
      emergency_phone: r[COL.emergency] ? String(r[COL.emergency]).trim() : null,
      property_email: email,
    })
  );
}

console.log(`Parsed ${dataRows.length} properties.\n`);

// --- Build SQL ---
// Match by `code` when present (UPSERT on UNIQUE INDEX), else by `name` (a
// safer fallback for the rows without CHORUM codes).
const escape = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const sqlStatements = [];
for (const p of dataRows) {
  const cols =
    'id, name, code, brand, owner_group, address_street, address_city, address_state, address_zip, room_count, phone, fax, emergency_phone, property_email';
  const vals = [
    genId(),
    p.name,
    p.code,
    p.brand,
    p.owner_group,
    p.address_street,
    p.address_city,
    p.address_state,
    p.address_zip,
    p.room_count,
    p.phone,
    p.fax,
    p.emergency_phone,
    p.property_email,
  ]
    .map(escape)
    .join(', ');

  const updateAssignments = [
    'name = excluded.name',
    'brand = excluded.brand',
    'owner_group = excluded.owner_group',
    'address_street = excluded.address_street',
    'address_city = excluded.address_city',
    'address_state = excluded.address_state',
    'address_zip = excluded.address_zip',
    'room_count = excluded.room_count',
    'phone = excluded.phone',
    'fax = excluded.fax',
    'emergency_phone = excluded.emergency_phone',
    'property_email = excluded.property_email',
  ].join(', ');

  // Two paths: with code → UPSERT on idx_properties_code.
  // Without code → INSERT only if not already present by name (manual check).
  if (p.code) {
    // Claim a code for any pre-existing nameless-code row first, so the UPSERT
    // below updates that row rather than inserting a duplicate. (Without this,
    // an earlier seed that lacked the code creates an orphan when the code
    // arrives — ON CONFLICT(code) doesn't match because NULL never collides.)
    sqlStatements.push(
      `UPDATE properties SET code = ${escape(p.code)}
       WHERE name = ${escape(p.name)} AND code IS NULL;`
    );
    sqlStatements.push(
      `INSERT INTO properties (${cols}) VALUES (${vals})
       ON CONFLICT(code) DO UPDATE SET ${updateAssignments};`
    );
  } else {
    // For coded properties this would risk duplicates; for non-coded ones we
    // resolve by name only when no row with that name already exists.
    sqlStatements.push(
      `INSERT INTO properties (${cols})
       SELECT ${vals}
       WHERE NOT EXISTS (SELECT 1 FROM properties WHERE name = ${escape(p.name)});`
    );
    // And a follow-up update by name to refresh fields.
    sqlStatements.push(
      `UPDATE properties SET ${updateAssignments
        .split(', ')
        .map((s) => s.replace('excluded.', '').replace(' = ', ' = '))
        .map((s) => {
          // Rebuild assignments with literal values.
          const k = s.split(' = ')[0];
          const v = (p)[k];
          return `${k} = ${escape(v)}`;
        })
        .join(', ')}
       WHERE name = ${escape(p.name)} AND (code IS NULL);`
    );
  }
}

// --- Write SQL to a temp file and run via wrangler ---
const dir = mkdtempSync(path.join(tmpdir(), 'seed-properties-'));
const sqlFile = path.join(dir, 'seed.sql');
writeFileSync(sqlFile, sqlStatements.join('\n\n'));

const wranglerArgs = [
  'wrangler',
  'd1',
  'execute',
  'suitemanager-portal',
  local ? '--local' : '--remote',
  `--file=${sqlFile}`,
];
console.log(`Running: npx ${wranglerArgs.join(' ')}\n`);
const result = spawnSync('npx', wranglerArgs, { stdio: 'inherit' });

rmSync(dir, { recursive: true, force: true });

if (result.status !== 0) {
  console.error('\nSeed failed.');
  process.exit(result.status || 1);
}
console.log('\nSeed complete.');
