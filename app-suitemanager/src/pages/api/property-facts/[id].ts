import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { canAccessProperty } from '../../../lib/property-access';

export const prerender = false;

// POST /api/property-facts/:id — update or delete a fact-sheet entry.
// Form field `action`: update | delete
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const id = params.id;
  if (!id) return bounce(request, null, 'missing id');

  const fact = await env.DB
    .prepare('SELECT id, property_id, label FROM property_facts WHERE id = ?')
    .bind(id)
    .first<{ id: string; property_id: string; label: string }>();
  if (!fact) return bounce(request, null, 'Fact not found.');
  if (!canAccessProperty(user, fact.property_id)) {
    return bounce(request, fact.property_id, 'forbidden');
  }

  const form = await request.formData();
  const action = String(form.get('action') || '');

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM property_facts WHERE id = ?').bind(id).run();
    await logAudit(env.DB, user!.id, 'fact.delete', { detail: fact.label });
    return back(request, fact.property_id);
  }

  if (action === 'update') {
    const label = String(form.get('label') || '').trim();
    const value = String(form.get('value') || '').trim();
    if (!label || !value) return bounce(request, fact.property_id, 'Label and value are both required.');
    await env.DB
      .prepare("UPDATE property_facts SET label = ?, value = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(label, value, id)
      .run();
    await logAudit(env.DB, user!.id, 'fact.update', { detail: label });
    return back(request, fact.property_id);
  }

  return bounce(request, fact.property_id, 'Unknown action.');
};

function back(request: Request, propertyId: string | null): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | null, msg: string): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
