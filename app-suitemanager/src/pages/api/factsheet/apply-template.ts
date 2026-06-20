import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { applyTemplateToProperty } from '../../../lib/factsheet-template';

export const prerender = false;

// POST /api/factsheet/apply-template — admin-only.
// Seeds the standardized fact-sheet template (Who-to-Call contacts +
// credentials) into every active property. Idempotent: re-running skips rows
// that already exist, so it never duplicates. Redirects back with ?seeded=N.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (user?.role !== 'admin') {
    return new Response('forbidden', { status: 403 });
  }

  const props = await env.DB
    .prepare('SELECT id FROM properties WHERE active = 1')
    .all<{ id: string }>();

  let properties = 0;
  let contactsInserted = 0;
  let credentialsInserted = 0;
  for (const row of props.results ?? []) {
    const result = await applyTemplateToProperty(env.DB, row.id, user.id);
    properties++;
    contactsInserted += result.contactsInserted;
    credentialsInserted += result.credentialsInserted;
  }

  await logAudit(env.DB, user.id, 'factsheet.apply_template', {
    detail: `${properties} properties · +${contactsInserted} contacts · +${credentialsInserted} credentials`,
  });

  return back(request, properties);
};

function back(request: Request, properties: number): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || '/admin/properties', request.url);
  url.searchParams.delete('error');
  url.searchParams.set('seeded', String(properties));
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
