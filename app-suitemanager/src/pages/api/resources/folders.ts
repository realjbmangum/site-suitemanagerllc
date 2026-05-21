import type { APIRoute } from 'astro';
import { generateId } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// POST /api/resources/folders — HR/admin creates a folder.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, 'You don’t have permission to create folders.');
  }

  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return bounce(request, 'Folder name is required.');

  const last = await env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM resource_folders')
    .first<{ n: number }>();
  const sortOrder = (last?.n ?? 0) + 1;

  const id = generateId();
  await env.DB
    .prepare(
      'INSERT INTO resource_folders (id, name, sort_order, created_by) VALUES (?, ?, ?, ?)'
    )
    .bind(id, name, sortOrder, user.id)
    .run();

  await logAudit(env.DB, user.id, 'folder.create', { detail: name });

  const back = new URL('/admin/templates', request.url);
  back.searchParams.set('folder', id);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/templates', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
