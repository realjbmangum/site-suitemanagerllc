import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { encryptSecret } from '../../../lib/crypto';
import { canAccessProperty } from '../../../lib/property-access';

export const prerender = false;

// POST /api/credentials/:id — update or delete a credential.
// Form field `action`: update | delete
//
// Ownership: the credential's property_id is loaded first, then checked with
// canAccessProperty — a GM may only touch their own property's credentials;
// admin/Strand any. `update` re-encrypts the password ONLY if a new one is
// supplied; an empty password field leaves the stored secret untouched.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const id = params.id;
  if (!id) return bounce(request, null, 'missing id');

  const cred = await env.DB
    .prepare('SELECT id, property_id, label FROM property_credentials WHERE id = ?')
    .bind(id)
    .first<{ id: string; property_id: string; label: string }>();
  if (!cred) return bounce(request, null, 'Credential not found.');
  if (!canAccessProperty(user, cred.property_id)) {
    return bounce(request, cred.property_id, 'forbidden');
  }

  const form = await request.formData();
  const action = String(form.get('action') || '');

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM property_credentials WHERE id = ?').bind(id).run();
    await logAudit(env.DB, user!.id, 'credential.update', {
      resourceId: id,
      detail: `delete ${cred.label}`,
    });
    return back(request, cred.property_id);
  }

  if (action === 'update') {
    const label = String(form.get('label') || '').trim();
    const accountNumber = String(form.get('account_number') || '').trim();
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    if (!label) return bounce(request, cred.property_id, 'System / vendor name is required.');

    if (password) {
      // New secret supplied → re-encrypt.
      let ciphertext: string;
      let iv: string;
      try {
        const enc = await encryptSecret(env.CREDENTIALS_KEY ?? '', password);
        ciphertext = enc.ciphertext;
        iv = enc.iv;
      } catch {
        return bounce(request, cred.property_id, 'Credentials vault is not configured.');
      }
      await env.DB
        .prepare(
          `UPDATE property_credentials
             SET label = ?, account_number = ?, username = ?,
                 password_ciphertext = ?, password_iv = ?,
                 updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(label, accountNumber || null, username || null, ciphertext, iv, id)
        .run();
    } else {
      // No new password → leave the stored secret untouched.
      await env.DB
        .prepare(
          `UPDATE property_credentials
             SET label = ?, account_number = ?, username = ?,
                 updated_at = datetime('now')
           WHERE id = ?`
        )
        .bind(label, accountNumber || null, username || null, id)
        .run();
    }

    await logAudit(env.DB, user!.id, 'credential.update', {
      resourceId: id,
      detail: `edit ${label}`,
    });
    return back(request, cred.property_id);
  }

  return bounce(request, cred.property_id, 'Unknown action.');
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
