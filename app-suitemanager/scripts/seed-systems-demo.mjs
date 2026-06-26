#!/usr/bin/env node
/**
 * LOCAL-ONLY demo data for the Systems matrix, so /corporate/systems has
 * something realistic to review before any real data is collected. Spreads
 * vendors across the first ~14 active properties, intentionally leaving some
 * GAPS and planting two DOUBLE-PAYS (two ISPs at one property, two phone
 * vendors at another) so the flags are visible.
 *
 *   npm run seed:systems:demo        # writes to LOCAL D1 only
 *
 * Re-running clears existing property_systems rows first (demo data only).
 */

import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.argv.includes('--remote')) {
  console.error('Refusing to seed demo data to REMOTE. This script is local-only.');
  process.exit(1);
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
    ['wrangler', 'd1', 'execute', 'suitemanager-portal', '--local', '--json', `--command=${sql}`],
    { encoding: 'utf8' }
  );
  if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(r.status || 1); }
  const parsed = JSON.parse(r.stdout);
  return (Array.isArray(parsed) ? parsed[0]?.results : parsed.results) || [];
}

const props = d1Json('SELECT id, name FROM properties WHERE active = 1 ORDER BY name').slice(0, 14);
if (props.length === 0) { console.error('No properties in local D1. Run: npm run seed:properties:local'); process.exit(1); }
const user = d1Json("SELECT id FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'strand' THEN 1 ELSE 2 END LIMIT 1")[0];
const createdBy = user?.id || genId(); // FK not enforced locally; placeholder is fine for demo

const VENDORS = {
  phone: ['RingCentral', 'Spectrum Voice', 'AT&T', 'Ooma Office'],
  isp: ['Spectrum Business', 'AT&T Fiber', 'Comcast Business', 'Lumen'],
  wifi_managed: ['Nomadix', 'Cloud5', 'Single Digits', 'GuestTek'],
  cable_tv: ['DIRECTV Hospitality', 'Spectrum TV', 'Dish Business'],
  cameras: ['Hikvision (local installer)', 'Verkada', 'Lorex'],
  alarm_fire: ['ADT Commercial', 'Johnson Controls', 'Vector Security'],
  door_locks: ['Onity', 'Onity', 'dormakaba'],
  pms: ['Jonas Chorum', 'Jonas Chorum', 'Jonas Chorum'],
};
const NOTICE = {
  isp: '30 days written notice to billing; early-term fee if under contract',
  phone: '30 days written notice; port numbers out before cancelling',
  alarm_fire: '60 days written notice — auto-renews annually',
  cable_tv: '30 days notice; return receivers to avoid charges',
  pms: 'Contact Jonas account rep; export data before deactivation',
  wifi_managed: '30 days notice to account manager',
  cameras: 'Month-to-month with local installer',
  door_locks: 'Owned hardware — cancel software/support only',
};
const TYPES = ['phone', 'isp', 'wifi_managed', 'cable_tv', 'cameras', 'alarm_fire', 'door_locks', 'pms'];
const COST = { phone: 18500, isp: 24900, wifi_managed: 32000, cable_tv: 41000, cameras: 9500, alarm_fire: 7200, door_locks: 4500, pms: 38000 };

const escape = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const rows = [];
function add(pid, type, vendorIdx, opts = {}) {
  const vendor = VENDORS[type][vendorIdx % VENDORS[type].length];
  rows.push([
    genId(), pid, type, vendor,
    'ACCT-' + (1000 + rows.length),
    opts.contact || null,
    opts.phone || null,
    opts.email || null,
    opts.cost ?? COST[type],
    opts.term || null,
    NOTICE[type] || null,
    opts.status || 'active',
    opts.notes || null,
    rows.length,
    createdBy,
  ]);
}

props.forEach((p, i) => {
  // Most properties get phone + isp + pms; the rest vary to create gaps.
  add(p.id, 'phone', i, { contact: 'Account Team', phone: '800-555-0100', email: 'support@vendor.com' });
  add(p.id, 'isp', i, { contact: 'Business Care', phone: '800-555-0142' });
  add(p.id, 'pms', 0, { contact: 'William Cheng', email: 'support@jonassoftware.com', term: '2026-12-31' });
  if (i % 2 === 0) add(p.id, 'wifi_managed', i, { contact: 'NOC' });
  if (i % 3 !== 0) add(p.id, 'cable_tv', i);
  if (i % 4 === 0) add(p.id, 'cameras', i);
  if (i % 2 === 1) add(p.id, 'alarm_fire', i, { phone: '888-555-0177' });
  if (i % 5 !== 0) add(p.id, 'door_locks', i % 3);
  // (cameras/alarm/wifi deliberately absent on some → coverage gaps)
});

// Plant two double-pays.
add(props[0].id, 'isp', 2, { contact: 'Old circuit — never cancelled', notes: 'Suspected duplicate of primary ISP' });
add(props[1].id, 'phone', 3, { contact: 'Legacy desk-phone line', notes: 'Replaced by RingCentral but still billing?' });

const sql =
  'DELETE FROM property_systems;\n' +
  rows
    .map(
      (r) =>
        `INSERT INTO property_systems
           (id, property_id, service_type, vendor_name, account_number, contact_name,
            contact_phone, contact_email, monthly_cost_cents, contract_end,
            cancel_notice, status, notes, sort_order, created_by)
         VALUES (${r.map(escape).join(', ')});`
    )
    .join('\n');

const dir = mkdtempSync(path.join(tmpdir(), 'seed-systems-demo-'));
const sqlFile = path.join(dir, 'demo.sql');
writeFileSync(sqlFile, sql);
console.log(`Seeding ${rows.length} demo systems across ${props.length} properties (LOCAL)…`);
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'suitemanager-portal', '--local', `--file=${sqlFile}`],
  { stdio: 'inherit' }
);
rmSync(dir, { recursive: true, force: true });
if (result.status !== 0) { console.error('\nDemo seed failed.'); process.exit(result.status || 1); }
console.log('\nDemo seed complete. Open /corporate/systems.');
