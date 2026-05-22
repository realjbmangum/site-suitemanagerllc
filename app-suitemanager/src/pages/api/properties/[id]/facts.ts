import type { APIRoute } from 'astro';
import { generateId } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { canAccessProperty } from '../../../../lib/property-access';

export const prerender = false;

// POST /api/properties/:id/facts — add a fact-sheet entry to a property.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const propertyId = params.id;
  if (!propertyId) return bounce(request, propertyId, 'missing id');
  if (!canAccessProperty(user, propertyId)) {
    return bounce(request, propertyId, 'forbidden');
  }

  const form = await request.formData();
  const label = String(form.get('label') || '').trim();
  const value = String(form.get('value') || '').trim();
  if (!label || !value) return bounce(request, propertyId, 'Label and value are both required.');

  const last = await env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM property_facts WHERE property_id = ?')
    .bind(propertyId)
    .first<{ n: number }>();

  await env.DB
    .prepare(
      `INSERT INTO property_facts (id, property_id, label, value, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(generateId(), propertyId, label, value, (last?.n ?? 0) + 1, user!.id)
    .run();

  await logAudit(env.DB, user!.id, 'fact.add', { detail: label });
  return back(request, propertyId);
};

function back(request: Request, propertyId: string | undefined): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | undefined, msg: string): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
