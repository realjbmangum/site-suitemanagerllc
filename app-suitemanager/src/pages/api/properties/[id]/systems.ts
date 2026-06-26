import type { APIRoute } from 'astro';
import { generateId } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { canAccessProperty } from '../../../../lib/property-access';
import { SERVICE_TYPE_VALUES, parseDollarsToCents } from '../../../../lib/systems';

export const prerender = false;

// POST /api/properties/:id/systems — add a systems/technology row to a property.
// Admin/Strand may add to any property; a GM only to their own. Mirrors the
// Who-to-Call contacts endpoint, with a controlled service_type + cost field.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const propertyId = params.id;
  if (!propertyId) return bounce(request, 'missing id');
  if (!canAccessProperty(user, propertyId)) {
    return bounce(request, 'forbidden');
  }

  const form = await request.formData();
  const serviceType = String(form.get('service_type') || '').trim();
  const vendorName = String(form.get('vendor_name') || '').trim();
  if (!SERVICE_TYPE_VALUES.includes(serviceType)) {
    return bounce(request, 'A valid system type is required.');
  }
  if (!vendorName) return bounce(request, 'A vendor name is required.');

  const status = String(form.get('status') || 'active') === 'cancelled' ? 'cancelled' : 'active';

  const last = await env.DB
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS n FROM property_systems WHERE property_id = ? AND service_type = ?'
    )
    .bind(propertyId, serviceType)
    .first<{ n: number }>();

  await env.DB
    .prepare(
      `INSERT INTO property_systems
         (id, property_id, service_type, vendor_name, account_number,
          contact_name, contact_phone, contact_email, monthly_cost_cents,
          contract_end, cancel_notice, status, notes, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateId(),
      propertyId,
      serviceType,
      vendorName,
      nz(form.get('account_number')),
      nz(form.get('contact_name')),
      nz(form.get('contact_phone')),
      nz(form.get('contact_email')),
      parseDollarsToCents(form.get('monthly_cost') as string | null),
      nz(form.get('contract_end')),
      nz(form.get('cancel_notice')),
      status,
      nz(form.get('notes')),
      (last?.n ?? 0) + 1,
      user!.id
    )
    .run();

  // NOTE: audit_events.resource_id is FK'd to resources(id), so a property id
  // can't go there (local D1 enforces it). Carry the property in `detail`.
  await logAudit(env.DB, user!.id, 'system.update', {
    detail: `add ${propertyId}: ${serviceType} / ${vendorName}`,
  });
  return back(request);
};

function nz(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

// Both helpers preserve the referer (the matrix page, with its current filters)
// so the user lands back where they were after the redirect.
function back(request: Request): Response {
  const url = new URL(request.headers.get('referer') || '/corporate/systems', request.url);
  url.searchParams.delete('error');
  url.searchParams.set('saved', '1');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, msg: string): Response {
  const url = new URL(request.headers.get('referer') || '/corporate/systems', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
