import type { APIRoute } from 'astro';
import { generateId } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { canAccessProperty } from '../../../../lib/property-access';

export const prerender = false;

const CATEGORIES = ['people', 'vendors', 'emergency_utility'] as const;
type Category = (typeof CATEGORIES)[number];

// POST /api/properties/:id/contacts — add a contact row (Who-to-Call) to a
// property. Admin/Strand may add to any property; a GM only to their own.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const propertyId = params.id;
  if (!propertyId) return bounce(request, propertyId, 'missing id');
  if (!canAccessProperty(user, propertyId)) {
    return bounce(request, propertyId, 'forbidden');
  }

  const form = await request.formData();
  const category = String(form.get('category') || '').trim() as Category;
  const label = String(form.get('label') || '').trim();
  if (!CATEGORIES.includes(category)) {
    return bounce(request, propertyId, 'A valid category is required.');
  }
  if (!label) return bounce(request, propertyId, 'A label is required.');

  // All typed fields are optional — a contact may have only a name, or only a
  // phone, etc. Empty strings are normalized to null.
  const contactName = nz(form.get('contact_name'));
  const phone = nz(form.get('phone'));
  const mobile = nz(form.get('mobile'));
  const email = nz(form.get('email'));
  const accountNumber = nz(form.get('account_number'));
  const fax = nz(form.get('fax'));

  const last = await env.DB
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS n FROM property_contacts WHERE property_id = ? AND category = ?'
    )
    .bind(propertyId, category)
    .first<{ n: number }>();

  await env.DB
    .prepare(
      `INSERT INTO property_contacts
         (id, property_id, category, label, contact_name, phone, mobile, email,
          account_number, fax, sort_order, is_custom, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(
      generateId(),
      propertyId,
      category,
      label,
      contactName,
      phone,
      mobile,
      email,
      accountNumber,
      fax,
      (last?.n ?? 0) + 1,
      user!.id
    )
    .run();

  await logAudit(env.DB, user!.id, 'contact.update', {
    resourceId: propertyId,
    detail: `add: ${label}`,
  });
  return back(request, propertyId);
};

function nz(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function back(request: Request, propertyId: string | undefined): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | undefined, msg: string): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
