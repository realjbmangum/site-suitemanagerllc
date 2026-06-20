import type { APIRoute } from 'astro';
import { generateId } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { encryptSecret } from '../../../../lib/crypto';
import { canAccessProperty } from '../../../../lib/property-access';

export const prerender = false;

// POST /api/properties/:id/credentials — add a credential (vendor login,
// alarm code, lock box) to a property. Admin/Strand any property; a GM only
// their own (canAccessProperty enforces user.propertyId === id). The password
// is AES-GCM encrypted before insert — plaintext never touches the DB.
//
// Form field `action`:
//   create  (default) — add a new credential row
//   reorder           — set sort_order on an existing row of this property
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const propertyId = params.id;
  if (!propertyId) return bounce(request, propertyId, 'missing id');
  if (!canAccessProperty(user, propertyId)) {
    return bounce(request, propertyId, 'forbidden');
  }

  const form = await request.formData();
  const action = String(form.get('action') || 'create');

  // --- reorder / set-custom on an existing row (scoped to this property) ---
  if (action === 'reorder') {
    const id = String(form.get('id') || '').trim();
    if (!id) return bounce(request, propertyId, 'missing credential id');
    const sortRaw = form.get('sort_order');
    const sortOrder = sortRaw == null ? null : parseInt(String(sortRaw), 10);
    if (sortOrder == null || !Number.isFinite(sortOrder)) {
      return bounce(request, propertyId, 'sort_order required');
    }
    const res = await env.DB
      .prepare(
        "UPDATE property_credentials SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND property_id = ?"
      )
      .bind(sortOrder, id, propertyId)
      .run();
    if (!res.meta.changes) return bounce(request, propertyId, 'Credential not found.');
    await logAudit(env.DB, user!.id, 'credential.update', {
      resourceId: id,
      detail: `reorder → ${sortOrder}`,
    });
    return back(request, propertyId);
  }

  // --- create ---
  const label = String(form.get('label') || '').trim();
  const accountNumber = String(form.get('account_number') || '').trim();
  const username = String(form.get('username') || '').trim();
  const password = String(form.get('password') || '');
  if (!label) return bounce(request, propertyId, 'System / vendor name is required.');

  let ciphertext: string | null = null;
  let iv: string | null = null;
  if (password) {
    try {
      const enc = await encryptSecret(env.CREDENTIALS_KEY ?? '', password);
      ciphertext = enc.ciphertext;
      iv = enc.iv;
    } catch {
      return bounce(request, propertyId, 'Credentials vault is not configured.');
    }
  }

  const last = await env.DB
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM property_credentials WHERE property_id = ?')
    .bind(propertyId)
    .first<{ n: number }>();

  await env.DB
    .prepare(
      `INSERT INTO property_credentials
         (id, property_id, label, account_number, username, password_ciphertext, password_iv, sort_order, is_custom, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(
      generateId(),
      propertyId,
      label,
      accountNumber || null,
      username || null,
      ciphertext,
      iv,
      (last?.n ?? 0) + 1,
      user!.id
    )
    .run();

  await logAudit(env.DB, user!.id, 'credential.update', { detail: `add ${label}` });
  return back(request, propertyId);
};

function back(request: Request, propertyId: string | undefined): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | undefined, msg: string): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
