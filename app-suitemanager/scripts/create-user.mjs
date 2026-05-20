#!/usr/bin/env node
// Generate a SQL INSERT for a new portal user with a PBKDF2-hashed password.
//
// Usage:
//   node scripts/create-user.mjs <email> <name> <role> <password>            # for strand/hr/admin
//   node scripts/create-user.mjs <email> <name> gm <propertyId> <password>   # for gm
//
// Apply the printed SQL with:
//   wrangler d1 execute suitemanager-portal --remote --command "<paste>"
//
// Or pipe to a file: ... > /tmp/u.sql && wrangler d1 execute ... --file=/tmp/u.sql

import { webcrypto as crypto } from 'node:crypto';
import { Buffer } from 'node:buffer';

const args = process.argv.slice(2);
const usage = () => {
  console.error('Usage:');
  console.error('  node scripts/create-user.mjs <email> <name> <role> <password>');
  console.error('  node scripts/create-user.mjs <email> <name> gm <propertyId> <password>');
  console.error('  roles: gm | strand | hr | admin');
  process.exit(1);
};

if (args.length < 4) usage();

let email, name, role, propertyId, password;
if (args[2] === 'gm') {
  if (args.length !== 5) usage();
  [email, name, role, propertyId, password] = args;
} else {
  if (args.length !== 4) usage();
  [email, name, role, password] = args;
  propertyId = null;
}

if (!['gm', 'strand', 'hr', 'admin'].includes(role)) {
  console.error(`Bad role: ${role}`);
  usage();
}

const ITERATIONS = 100_000;
const enc = new TextEncoder();
const salt = new Uint8Array(16);
crypto.getRandomValues(salt);
const keyMat = await crypto.subtle.importKey(
  'raw',
  enc.encode(password),
  { name: 'PBKDF2' },
  false,
  ['deriveBits']
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMat,
  256
);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const hash = `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;

const ALPHABET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function id(len = 16) {
  const r = new Uint8Array(len);
  crypto.getRandomValues(r);
  let s = '';
  for (const b of r) s += ALPHABET[b % ALPHABET.length];
  return s;
}
const escape = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);

const userId = id();
// UPSERT on email so re-running the script (to reset a password) is safe.
const sql =
  `INSERT INTO users (id, email, name, password_hash, role, property_id) VALUES (` +
  `${escape(userId)}, ${escape(email.toLowerCase())}, ${escape(name)}, ` +
  `${escape(hash)}, ${escape(role)}, ${escape(propertyId)}) ` +
  `ON CONFLICT(email) DO UPDATE SET ` +
  `name = excluded.name, password_hash = excluded.password_hash, ` +
  `role = excluded.role, property_id = excluded.property_id, active = 1;`;

console.log(sql);
