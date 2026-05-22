import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { canAccessProperty } from '../../../lib/property-access';

export const prerender = false;

// POST /api/property-files/:id — delete (archive) a property file.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const id = params.id;
  if (!id) return bounce(request, null, 'missing id');

  const row = await env.DB
    .prepare('SELECT id, property_id, title FROM property_files WHERE id = ?')
    .bind(id)
    .first<{ id: string; property_id: string; title: string }>();
  if (!row) return bounce(request, null, 'File not found.');
  if (!canAccessProperty(user, row.property_id)) {
    return bounce(request, row.property_id, 'forbidden');
  }

  await env.DB
    .prepare("UPDATE property_files SET archived_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
  await logAudit(env.DB, user!.id, 'propertyfile.archive', { detail: row.title });

  return back(request, row.property_id);
};

function back(request: Request, propertyId: string | null): Response {
  const url = new URL(request.headers.get('referer') || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | null, msg: string): Response {
  const url = new URL(request.headers.get('referer') || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
