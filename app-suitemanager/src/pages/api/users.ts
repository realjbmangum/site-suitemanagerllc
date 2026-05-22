import type { APIRoute } from 'astro';
import { generateId, generateToken } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { buildInviteEmail } from '../../lib/email/templates';
import { trySend } from '../../lib/email/graph';

export const prerender = false;

const INVITE_TTL_DAYS = 7;

// POST /api/users — admin creates a user with an invite token.
// Form fields: email, name, role, property_id (required when role='gm')
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') {
    return json(403, { error: 'forbidden' });
  }

  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const name = String(form.get('name') || '').trim();
  const role = String(form.get('role') || '') as SessionUser['role'];
  const propertyId =
    String(form.get('property_id') || '').trim() || null;

  if (!email || !name || !['gm', 'strand', 'admin'].includes(role)) {
    return bounce(request, 'Email, name, and role are all required.');
  }
  if (role === 'gm' && !propertyId) {
    return bounce(request, 'A GM must be assigned to a property.');
  }

  const inviteToken = generateToken(32);
  const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000).toISOString();
  const userId = generateId();

  try {
    await env.DB
      .prepare(
        `INSERT INTO users (id, email, name, role, property_id, invite_token, invite_expires_at, password_hash, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)
         ON CONFLICT(email) DO UPDATE SET
           name = excluded.name,
           role = excluded.role,
           property_id = excluded.property_id,
           invite_token = excluded.invite_token,
           invite_expires_at = excluded.invite_expires_at,
           active = 1`
      )
      .bind(userId, email, name, role, propertyId, inviteToken, expires)
      .run();
  } catch (e: any) {
    return bounce(request, e?.message || 'Could not create the user.');
  }

  await logAudit(env.DB, locals.user.id, 'user.invite', {
    detail: `invited ${email} as ${role}`,
  });

  // Send the invite email (best-effort — the copy-link in the UI is the
  // fallback if Graph mail isn't configured or the send fails).
  const origin = new URL(request.url).origin;
  let propertyName: string | undefined;
  if (role === 'gm' && propertyId) {
    const prop = await env.DB
      .prepare('SELECT name FROM properties WHERE id = ?')
      .bind(propertyId)
      .first<{ name: string }>();
    propertyName = prop?.name;
  }
  const invite = buildInviteEmail({
    recipientName: name,
    recipientEmail: email,
    role,
    inviteUrl: `${origin}/invite/${inviteToken}`,
    expiresAt: expires,
    inviterName: locals.user.name,
    propertyName,
  });
  const emailed = await trySend(env, {
    to: email,
    subject: invite.subject,
    html: invite.html,
  });

  // Redirect back to /admin/users with the new invite token shown so admin can
  // copy/share the link (and a flag for whether the email went out).
  const back = new URL('/admin/users', request.url);
  back.searchParams.set('invited', inviteToken);
  back.searchParams.set('emailed', emailed ? '1' : '0');
  return redirect(back.toString(), 302);
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/users', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
