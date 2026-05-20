import type { APIRoute } from 'astro';
import { verifyPassword } from '../../../lib/crypto';
import { createSession, roleHome, sessionCookie, SESSION_TTL_SECONDS } from '../../../lib/session';
import { generateId } from '../../../lib/ids';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  const { email, password, next } = await readBody(request);
  if (!email || !password) return badLogin(request, 'Email and password are required.');

  const row = await env.DB
    .prepare('SELECT id, email, password_hash, role, active FROM users WHERE email = ?')
    .bind(email.trim().toLowerCase())
    .first<{ id: string; email: string; password_hash: string; role: SessionUser['role']; active: number }>();

  if (!row || !row.active) return badLogin(request, 'Email or password is incorrect.');

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return badLogin(request, 'Email or password is incorrect.');

  const { token } = await createSession(env.DB, row.id);

  // Audit: login event.
  await env.DB
    .prepare('INSERT INTO audit_events (id, user_id, action) VALUES (?, ?, ?)')
    .bind(generateId(), row.id, 'login')
    .run();

  const dest = isSafeNext(next) ? next! : roleHome(row.role);
  const secure = new URL(request.url).protocol === 'https:';
  const cookie = sessionCookie(token, SESSION_TTL_SECONDS, secure);

  return new Response(null, {
    status: 302,
    headers: { 'set-cookie': cookie, location: dest },
  });
};

async function readBody(request: Request): Promise<{ email: string; password: string; next: string | null }> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = (await request.json()) as { email?: string; password?: string; next?: string };
    return { email: body.email ?? '', password: body.password ?? '', next: body.next ?? null };
  }
  const form = await request.formData();
  return {
    email: String(form.get('email') ?? ''),
    password: String(form.get('password') ?? ''),
    next: form.get('next') ? String(form.get('next')) : null,
  };
}

function isSafeNext(next: string | null): next is string {
  // Only allow same-origin paths starting with `/` but not `//` (protocol-relative).
  return !!next && next.startsWith('/') && !next.startsWith('//');
}

function badLogin(request: Request, msg: string): Response {
  const url = new URL('/login', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
