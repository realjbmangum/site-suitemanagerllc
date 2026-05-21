import { defineMiddleware } from 'astro:middleware';
import { loadSession, readSessionToken } from './lib/session';

const PUBLIC_PATHS = new Set<string>([
  '/login',
  '/api/auth/login',
  '/api/auth/activate',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/invite/')) return true;     // magic-link activation
  if (pathname.startsWith('/_')) return true;           // Astro internals
  if (pathname.startsWith('/favicon')) return true;
  if (pathname === '/logo.png') return true;
  return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  // In a dev environment without bindings, fall through. The Cloudflare
  // adapter's platformProxy provides DB locally.
  if (!env?.DB) return next();

  const url = new URL(context.request.url);
  const path = url.pathname;

  // Load session if cookie present.
  const token = readSessionToken(context.request.headers.get('cookie'));
  if (token) {
    const user = await loadSession(env.DB, token);
    if (user) context.locals.user = user;
  }

  if (isPublic(path)) return next();

  // Require auth.
  if (!context.locals.user) {
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const dest = new URL('/login', context.request.url);
    if (path !== '/' && path !== '/login') dest.searchParams.set('next', path);
    return Response.redirect(dest, 302);
  }

  // Role gates (page routes). Admin can access every surface.
  const role = context.locals.user.role;
  if (path === '/my-property' && role !== 'gm' && role !== 'admin') {
    return Response.redirect(new URL('/dashboard', context.request.url), 302);
  }
  // GMs can OPEN a document detail page for their own property (the page
  // enforces the property-match check). They cannot see the dashboard list.
  if (path === '/dashboard' && role !== 'strand' && role !== 'admin') {
    return Response.redirect(new URL('/my-property', context.request.url), 302);
  }
  // /admin/templates and /admin/financials are open to strand + admin.
  // Everything else under /admin/ is admin-only.
  if (
    path.startsWith('/admin/templates') ||
    path.startsWith('/admin/financials')
  ) {
    if (role !== 'strand' && role !== 'admin') {
      return Response.redirect(new URL('/dashboard', context.request.url), 302);
    }
  } else if (path.startsWith('/admin/')) {
    if (role !== 'admin') {
      return Response.redirect(new URL('/dashboard', context.request.url), 302);
    }
  }

  return next();
});
