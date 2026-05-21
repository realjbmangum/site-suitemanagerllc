#!/usr/bin/env node
/**
 * Geocode any property rows missing latitude/longitude, using the free
 * Nominatim service (OpenStreetMap). One-time-ish: re-run anytime new
 * properties get added.
 *
 *   npm run geocode:properties         # against remote D1
 *   npm run geocode:properties:local   # against local D1
 *
 * Nominatim usage policy:
 *  - Max 1 request/second
 *  - Custom User-Agent identifying the app + contact
 * https://operations.osmfoundation.org/policies/nominatim/
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const local = args.includes('--local');

const UA = 'SuiteManagerPortal/1.0 (bmangum1@gmail.com)';

function wrangler(cmd) {
  const wargs = [
    'wrangler',
    'd1',
    'execute',
    'suitemanager-portal',
    local ? '--local' : '--remote',
    '--command',
    cmd,
    '--json',
  ];
  const r = spawnSync('npx', wargs, { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('wrangler failed:', r.stderr);
    process.exit(1);
  }
  // Wrangler JSON output is an array of statement results.
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed[0]?.results || [];
  } catch (e) {
    console.error('Could not parse wrangler JSON:', r.stdout.slice(0, 500));
    process.exit(1);
  }
}

function wranglerFile(sqlText) {
  const dir = mkdtempSync(path.join(tmpdir(), 'geocode-'));
  const file = path.join(dir, 'run.sql');
  writeFileSync(file, sqlText);
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'suitemanager-portal',
      local ? '--local' : '--remote',
      '--file=' + file,
    ],
    { encoding: 'utf8' }
  );
  rmSync(dir, { recursive: true, force: true });
  if (r.status !== 0) {
    console.error('wrangler file run failed:', r.stderr);
    process.exit(1);
  }
}

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    query
  )}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return {
    lat: parseFloat(arr[0].lat),
    lng: parseFloat(arr[0].lon),
    display_name: arr[0].display_name,
  };
}

const buildQuery = (p) =>
  [p.address_street, p.address_city, p.address_state, p.address_zip]
    .filter(Boolean)
    .join(', ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Main ---
console.log(`Pulling properties missing coordinates (${local ? 'local' : 'remote'})…`);
const rows = wrangler(
  'SELECT id, name, address_street, address_city, address_state, address_zip ' +
    'FROM properties WHERE active = 1 AND (latitude IS NULL OR longitude IS NULL)'
);

if (rows.length === 0) {
  console.log('Nothing to do — every active property already has coords.');
  process.exit(0);
}

console.log(`Geocoding ${rows.length} properties…\n`);

const updates = [];
const failed = [];

for (let i = 0; i < rows.length; i++) {
  const p = rows[i];
  const q = buildQuery(p);
  if (!q) {
    console.log(`  [${i + 1}/${rows.length}] ${p.name} — no address, skipping`);
    failed.push({ name: p.name, reason: 'no address' });
    continue;
  }
  try {
    const hit = await geocode(q);
    if (hit) {
      console.log(`  [${i + 1}/${rows.length}] ${p.name} → ${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)}`);
      updates.push({ id: p.id, lat: hit.lat, lng: hit.lng });
    } else {
      // Fallback: city + state only.
      const fallback = [p.address_city, p.address_state]
        .filter(Boolean)
        .join(', ');
      if (fallback && fallback !== q) {
        await sleep(1100);
        const hit2 = await geocode(fallback);
        if (hit2) {
          console.log(
            `  [${i + 1}/${rows.length}] ${p.name} → ${hit2.lat.toFixed(4)}, ${hit2.lng.toFixed(4)} (city-state fallback)`
          );
          updates.push({ id: p.id, lat: hit2.lat, lng: hit2.lng });
        } else {
          console.log(`  [${i + 1}/${rows.length}] ${p.name} — no match`);
          failed.push({ name: p.name, reason: 'no match' });
        }
      } else {
        console.log(`  [${i + 1}/${rows.length}] ${p.name} — no match`);
        failed.push({ name: p.name, reason: 'no match' });
      }
    }
  } catch (e) {
    console.log(`  [${i + 1}/${rows.length}] ${p.name} — error: ${e.message}`);
    failed.push({ name: p.name, reason: e.message });
  }
  // Rate limit: 1 req/sec + jitter
  await sleep(1100);
}

if (updates.length === 0) {
  console.log('\nNo updates to write.');
  if (failed.length) console.log('Failed:', failed);
  process.exit(0);
}

const sql = updates
  .map(
    (u) =>
      `UPDATE properties SET latitude = ${u.lat}, longitude = ${u.lng} WHERE id = '${u.id}';`
  )
  .join('\n');

console.log(`\nWriting ${updates.length} updates to D1…`);
wranglerFile(sql);
console.log('Done.');
if (failed.length) {
  console.log(`\n${failed.length} property/properties not geocoded:`);
  for (const f of failed) console.log(`  - ${f.name}: ${f.reason}`);
}
