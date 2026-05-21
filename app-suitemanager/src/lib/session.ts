import { generateToken } from './ids';

export const SESSION_COOKIE_NAME = 'sm_session';
export const SESSION_TTL_SECONDS = 12 * 3600; // 12 hours

export async function createSession(
  db: D1Database,
  userId: string
): Promise<{ token: string; expiresAt: string }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, userId, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function loadSession(
  db: D1Database,
  token: string
): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.property_id, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND u.active = 1`
    )
    .bind(token)
    .first<{
      id: string;
      email: string;
      name: string;
      role: SessionUser['role'];
      property_id: string | null;
      expires_at: string;
    }>();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    // Best-effort cleanup; ignore failures.
    db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run().catch(() => {});
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    propertyId: row.property_id,
  };
}

export async function destroySession(
  db: D1Database,
  token: string
): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === SESSION_COOKIE_NAME && v) return v;
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function roleHome(role: SessionUser['role']): string {
  switch (role) {
    case 'gm':
      return '/my-property';
    case 'strand':
      return '/dashboard';
    case 'admin':
      return '/dashboard';
  }
}
