import type { APIRoute } from 'astro';
import { setSetting } from '../../lib/settings';
import { logAudit } from '../../lib/audit';

export const prerender = false;

// POST /api/settings — admin updates app settings.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (locals.user?.role !== 'admin') return bounce(request, 'forbidden');

  const form = await request.formData();
  const thresholdDollars = String(form.get('approval_threshold') || '').trim();

  if (thresholdDollars !== '') {
    const n = Number(thresholdDollars.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      return bounce(request, 'Approval threshold must be a positive number.');
    }
    const cents = Math.round(n * 100);
    await setSetting(env.DB, 'approval_threshold_cents', String(cents));
    await logAudit(env.DB, locals.user.id, 'settings.update', {
      detail: `approval_threshold = $${n.toFixed(2)}`,
    });
  }

  const back = new URL('/admin/settings', request.url);
  back.searchParams.set('saved', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/settings', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
