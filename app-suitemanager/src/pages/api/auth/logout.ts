import type { APIRoute } from 'astro';
import {
  clearSessionCookie,
  destroySession,
  readSessionToken,
} from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const token = readSessionToken(request.headers.get('cookie'));
  if (token) await destroySession(env.DB, token);

  const secure = new URL(request.url).protocol === 'https:';
  return new Response(null, {
    status: 302,
    headers: { 'set-cookie': clearSessionCookie(secure), location: '/login' },
  });
};
