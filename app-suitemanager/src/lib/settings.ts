// Key-value app settings, stored in the `settings` D1 table.

export async function getSetting(
  db: D1Database,
  key: string,
  fallback: string
): Promise<string> {
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(key, value)
    .run();
}

// Invoices at or above this amount require approval. Default $500.
export async function getApprovalThresholdCents(db: D1Database): Promise<number> {
  const v = await getSetting(db, 'approval_threshold_cents', '50000');
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 50000;
}
