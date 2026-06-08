import type { APIRoute } from 'astro';
import { generateId } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

const REGIONAL_KINDS = new Set(['travel', 'ooo', 'other']);
const PTO_KINDS = new Set(['vacation', 'sick', 'personal']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/calendar/events — create a new event.
//   source=regional: admin posts their own schedule (travel/ooo/other)
//   source=gm_pto:   GM requests PTO (vacation/sick/personal) → pending approval
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');

  const form = await request.formData();
  const source = String(form.get('source') || '').trim();
  const kind = String(form.get('kind') || '').trim();
  const title = String(form.get('title') || '').trim();
  const startsAt = String(form.get('starts_at') || '').trim();
  const endsAt = String(form.get('ends_at') || '').trim();
  const notes = String(form.get('notes') || '').trim() || null;

  if (!ISO_DATE.test(startsAt) || !ISO_DATE.test(endsAt)) {
    return bounce(request, 'Start and end dates are required (YYYY-MM-DD).');
  }
  if (endsAt < startsAt) {
    return bounce(request, 'End date must be on or after the start date.');
  }

  if (source === 'regional') {
    if (user.role !== 'admin') {
      return bounce(request, 'Only Suite Manager admins can post regional schedules.');
    }
    if (!REGIONAL_KINDS.has(kind)) {
      return bounce(request, 'Pick a schedule type.');
    }
    const id = generateId();
    const finalTitle = title || `${user.name} — ${kindLabel(kind)}`;
    await env.DB
      .prepare(
        `INSERT INTO calendar_events
           (id, owner_user_id, source, title, kind, starts_at, ends_at, all_day, notes, approval_status)
         VALUES (?, ?, 'regional', ?, ?, ?, ?, 1, ?, 'not_required')`
      )
      .bind(id, user.id, finalTitle, kind, startsAt, endsAt, notes)
      .run();
    await logAudit(env.DB, user.id, 'calendar.create', {
      detail: `regional · ${kind} · ${startsAt}→${endsAt}`,
    });
    return redirect(request, '/corporate/calendar?created=1');
  }

  if (source === 'gm_pto') {
    if (user.role !== 'gm') {
      return bounce(request, 'Only GMs can request PTO from this form.');
    }
    if (!user.propertyId) {
      return bounce(request, 'Your account is not assigned to a property — contact your admin.');
    }
    if (!PTO_KINDS.has(kind)) {
      return bounce(request, 'Pick a PTO type.');
    }
    const id = generateId();
    const finalTitle = `${user.name} — ${kindLabel(kind)}`;
    await env.DB
      .prepare(
        `INSERT INTO calendar_events
           (id, owner_user_id, source, title, kind, starts_at, ends_at, all_day, notes, property_id, approval_status)
         VALUES (?, ?, 'gm_pto', ?, ?, ?, ?, 1, ?, ?, 'pending')`
      )
      .bind(id, user.id, finalTitle, kind, startsAt, endsAt, notes, user.propertyId)
      .run();
    await logAudit(env.DB, user.id, 'pto.request', {
      detail: `${kind} · ${startsAt}→${endsAt}`,
    });
    return redirect(request, '/my-property?pto=requested');
  }

  return bounce(request, 'Unknown event source.');
};

function kindLabel(k: string): string {
  switch (k) {
    case 'travel': return 'Travel';
    case 'ooo': return 'Out of office';
    case 'other': return 'Schedule';
    case 'vacation': return 'Vacation';
    case 'sick': return 'Sick';
    case 'personal': return 'Personal';
    default: return k;
  }
}

function redirect(request: Request, path: string): Response {
  const back = new URL(path, request.url);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}

function bounce(request: Request, msg: string): Response {
  const ref = request.headers.get('referer');
  const u = new URL(ref || '/corporate/calendar', request.url);
  u.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: u.toString() } });
}
