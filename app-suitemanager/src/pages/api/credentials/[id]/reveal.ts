import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';
import { decryptSecret } from '../../../../lib/crypto';
import { canAccessProperty } from '../../../../lib/property-access';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });

// POST /api/credentials/:id/reveal — the ONLY place a credential password is
// decrypted. Auth + ownership check (a GM may only reveal their own property's
// credentials; admin/Strand any), decrypt server-side, write an audited
// `credential.reveal` event, return { value }. Plaintext is never rendered into
// any page or returned by any other endpoint.
export const POST: APIRoute = async ({ params, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  const id = params.id;
  if (!id) return json({ error: 'bad request' }, 400);

  // Load the row + its property name (for a useful audit detail). The property
  // join is left-outer-safe — name is best-effort, ownership relies on
  // property_id.
  const cred = await env.DB
    .prepare(
      `SELECT c.id, c.property_id, c.label, c.password_ciphertext, c.password_iv,
              p.name AS property_name
         FROM property_credentials c
         LEFT JOIN properties p ON p.id = c.property_id
        WHERE c.id = ?`
    )
    .bind(id)
    .first<{
      id: string;
      property_id: string;
      label: string;
      password_ciphertext: string | null;
      password_iv: string | null;
      property_name: string | null;
    }>();

  // Same opaque 404 for "missing" and "not yours" so a GM can't probe ids.
  if (!cred || !canAccessProperty(user, cred.property_id)) {
    return json({ error: 'not found' }, 404);
  }

  if (!cred.password_ciphertext || !cred.password_iv) {
    return json({ error: 'no password set' }, 404);
  }

  let value: string;
  try {
    value = await decryptSecret(env.CREDENTIALS_KEY ?? '', cred.password_ciphertext, cred.password_iv);
  } catch {
    return json({ error: 'vault unavailable' }, 500);
  }

  const where = cred.property_name ? `${cred.label} @ ${cred.property_name}` : cred.label;
  await logAudit(env.DB, user.id, 'credential.reveal', {
    resourceId: cred.id,
    detail: where,
  });

  return json({ value });
};
