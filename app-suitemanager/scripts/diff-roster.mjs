#!/usr/bin/env node
/**
 * Read both the original and updated ASA roster spreadsheets and print a
 * field-by-field diff so we can review what changed before re-seeding.
 *
 *   node scripts/diff-roster.mjs
 */

import path from 'node:path';
import xlsx from 'xlsx';

const FILES = {
  before: 'data/ASA Location Phone List 2026.xlsx',
  after: 'data/ASA Location Phone List 2026-updated.xlsx',
};

function parseAddress(addr) {
  if (!addr) return {};
  let parts = String(addr).split(',').map((s) => s.trim()).filter(Boolean);
  let state = null, zip = null;
  const last = parts[parts.length - 1] || '';
  const m1 = last.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
  if (m1) { state = m1[1]; zip = m1[2]; parts.pop(); }
  else if (/^\d{5}(-\d{4})?$/.test(last)) {
    zip = last; parts.pop();
    const prev = parts[parts.length - 1] || '';
    if (/^[A-Z]{2}$/.test(prev)) { state = prev; parts.pop(); }
  }
  const city = parts.length ? parts.pop() : null;
  const street = parts.length ? parts.join(', ') : null;
  return { street, city, state, zip };
}

function readRoster(filePath) {
  const wb = xlsx.readFile(path.resolve(filePath));
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && String(rows[i][0] || '').trim().toLowerCase() === 'hotel') {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) throw new Error(`No header in ${filePath}`);

  const header = rows[headerIdx].map((h) =>
    String(h || '').trim().toLowerCase().replace(/\s+/g, ' '));
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

  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const name = String(r[COL.hotel] || '').trim();
    if (!name || name.toLowerCase() === 'total') continue;
    if (!r[COL.hotel] && r[COL.rooms]) continue;

    const addr = parseAddress(r[COL.address]);
    const rooms = r[COL.rooms];
    out.push({
      name: name === 'Salibury' ? 'Salisbury' : name,
      code: r[COL.chorum] ? String(r[COL.chorum]).trim() : null,
      owner: r[COL.owner] ? String(r[COL.owner]).trim() : null,
      manager: r[COL.manager] ? String(r[COL.manager]).trim() : null,
      address_raw: r[COL.address] ? String(r[COL.address]).trim() : null,
      address_street: addr.street ?? null,
      address_city: addr.city ?? null,
      address_state: addr.state ?? null,
      address_zip: addr.zip ?? null,
      room_count: Number.isFinite(Number(rooms)) ? Number(rooms) : null,
      phone: r[COL.phone] ? String(r[COL.phone]).trim() : null,
      fax: r[COL.fax] ? String(r[COL.fax]).trim() : null,
      emergency_phone: r[COL.emergency] ? String(r[COL.emergency]).trim() : null,
      email: r[COL.email] ? String(r[COL.email]).trim() : null,
    });
  }
  return out;
}

const before = readRoster(FILES.before);
const after = readRoster(FILES.after);

console.log(`BEFORE: ${before.length} rows    AFTER: ${after.length} rows\n`);

// Key by name (lowercase) so re-keyed/missing CHORUM codes still match.
const key = (p) => p.name.toLowerCase().trim();
const beforeByKey = new Map(before.map((p) => [key(p), p]));
const afterByKey = new Map(after.map((p) => [key(p), p]));

const allKeys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);

const onlyBefore = [];
const onlyAfter = [];
const changed = [];

for (const k of allKeys) {
  const b = beforeByKey.get(k);
  const a = afterByKey.get(k);
  if (!a) { onlyBefore.push(b); continue; }
  if (!b) { onlyAfter.push(a); continue; }

  const fields = ['code', 'owner', 'manager', 'address_raw', 'room_count', 'phone', 'fax', 'emergency_phone', 'email'];
  const diffs = [];
  for (const f of fields) {
    const bv = b[f] ?? '';
    const av = a[f] ?? '';
    if (String(bv).trim() !== String(av).trim()) {
      diffs.push({ field: f, before: bv, after: av });
    }
  }
  if (diffs.length) changed.push({ name: a.name, diffs });
}

console.log(`=== Rows only in BEFORE (${onlyBefore.length}) ===`);
for (const p of onlyBefore) console.log(`  - ${p.name}  [code: ${p.code ?? '—'}]`);

console.log(`\n=== Rows only in AFTER (${onlyAfter.length}) ===`);
for (const p of onlyAfter) console.log(`  + ${p.name}  [code: ${p.code ?? '—'}]`);

console.log(`\n=== Rows with changed fields (${changed.length}) ===`);
for (const c of changed) {
  console.log(`\n* ${c.name}`);
  for (const d of c.diffs) {
    console.log(`    ${d.field}:`);
    console.log(`        - ${JSON.stringify(d.before)}`);
    console.log(`        + ${JSON.stringify(d.after)}`);
  }
}

console.log(`\nSummary: ${changed.length} changed, ${onlyAfter.length} added, ${onlyBefore.length} removed.`);
