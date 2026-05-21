import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/users/:id/update — admin edits name, role, property, active flag.
// Email is fixed (it's the identity). Use Delete + re-invite to change it.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') return bounce(params.id, 'forbidden');

  const id = params.id;
  if (!id) return bounce(undefined, 'missing id');

  const target = await env.DB
    .prepare('SELECT id, email, role, property_id, active FROM users WHERE id = ?')
    .bind(id)
    .first<{ id: string; email: string; role: SessionUser['role']; property_id: string | null; active: number }>();
  if (!target) return bounce(id, 'User not found.');

  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  const role = String(form.get('role') || '') as SessionUser['role'];
  const propertyId = String(form.get('property_id') || '').trim() || null;
  const active = form.get('active') ? 1 : 0;

  if (!name) return bounce(id, 'Full name is required.');
  if (!['gm', 'strand', 'hr', 'admin'].includes(role)) {
    return bounce(id, 'Pick a valid role.');
  }
  if (role === 'gm' && !propertyId) {
    return bounce(id, 'A GM must be assigned to a property.');
  }

  // Safety nets when editing your own account.
  if (target.id === locals.user.id) {
    if (role !== 'admin') return bounce(id, "You can't change your own role away from admin.");
    if (!active) return bounce(id, "You can't deactivate your own account.");
  }

  await env.DB
    .prepare(
      `UPDATE users
       SET name = ?, role = ?, property_id = ?, active = ?
       WHERE id = ?`
    )
    .bind(name, role, role === 'gm' ? propertyId : null, active, id)
    .run();

  // Wipe sessions if we just deactivated them or changed their role.
  if (!active || role !== target.role) {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }

  await logAudit(env.DB, locals.user.id, 'user.update', {
    detail: `${target.email}: role=${role}, property=${propertyId || 'none'}, active=${active}`,
  });

  const back = new URL(`/admin/users/${id}`, request.url);
  back.searchParams.set('saved', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(id: string | undefined, msg: string): Response {
  const path = id ? `/admin/users/${id}` : '/admin/users';
  const url = new URL(path, 'https://placeholder.invalid');
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.pathname + url.search } });
}
