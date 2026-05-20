import { generateId } from './ids';

export async function logAudit(
  db: D1Database,
  userId: string,
  action: string,
  opts: { documentId?: string; resourceId?: string; detail?: string } = {}
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_events (id, document_id, resource_id, user_id, action, detail)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateId(),
      opts.documentId ?? null,
      opts.resourceId ?? null,
      userId,
      action,
      opts.detail ?? null
    )
    .run();
}
