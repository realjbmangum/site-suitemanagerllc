import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return new Response('unauthorized', { status: 401 });

  const id = params.id;
  if (!id) return new Response('bad request', { status: 400 });
  const inline = new URL(request.url).searchParams.get('inline') === '1';

  const row = await env.DB
    .prepare(
      'SELECT id, r2_key, filename, mime_type FROM resources WHERE id = ? AND archived_at IS NULL'
    )
    .bind(id)
    .first<{ id: string; r2_key: string; filename: string; mime_type: string }>();
  if (!row) return new Response('not found', { status: 404 });

  const obj = await env.FILES.get(row.r2_key);
  if (!obj) return new Response('file missing', { status: 410 });

  // Inline previews don't write audit rows — they fire on every modal open.
  if (!inline) {
    await logAudit(env.DB, user.id, 'resource.download', {
      resourceId: row.id,
      detail: row.filename,
    });
  }

  return new Response(obj.body, {
    headers: {
      'content-type': row.mime_type,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${row.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
};
