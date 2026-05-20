import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return new Response('unauthorized', { status: 401 });

  const id = params.id;
  if (!id) return new Response('bad request', { status: 400 });

  // Role scoping: GMs can only download their own property's docs.
  let sql =
    'SELECT id, r2_key, filename, mime_type, property_id FROM documents WHERE id = ?';
  const args: unknown[] = [id];
  if (user.role === 'gm') {
    sql += ' AND property_id = ?';
    args.push(user.propertyId);
  }
  // strand + admin see everything. hr is blocked entirely.
  if (user.role === 'hr') return new Response('forbidden', { status: 403 });

  const row = await env.DB.prepare(sql).bind(...args).first<{
    id: string; r2_key: string; filename: string; mime_type: string; property_id: string;
  }>();
  if (!row) return new Response('not found', { status: 404 });

  const obj = await env.FILES.get(row.r2_key);
  if (!obj) return new Response('file missing', { status: 410 });

  await logAudit(env.DB, user.id, 'download', {
    documentId: row.id,
    detail: row.filename,
  });

  return new Response(obj.body, {
    headers: {
      'content-type': row.mime_type,
      'content-disposition': `attachment; filename="${row.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
};
