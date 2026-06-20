import type { APIRoute } from 'astro';
import { generateId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import { applyTemplateToProperty } from '../../lib/factsheet-template';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') {
    return new Response('forbidden', { status: 403 });
  }
  const form = await request.formData();
  const name = String(form.get('name') || '').trim();
  if (!name) return bounce(request, 'Property name is required.');

  const id = generateId();
  await env.DB
    .prepare('INSERT INTO properties (id, name) VALUES (?, ?)')
    .bind(id, name)
    .run();

  // Seed the standardized Fact Sheet ("Red Binder") backbone — blank Who-to-Call
  // contacts + credentials vault rows — so every new property ships with the
  // template ready to fill in. Idempotent; safe even if re-run.
  await applyTemplateToProperty(env.DB, id, locals.user.id);

  await logAudit(env.DB, locals.user.id, 'property.create', { detail: name });

  const back = new URL('/admin/users', request.url);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/users', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
