import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { canAccessProperty } from '../../../lib/property-access';
import { SERVICE_TYPE_VALUES, parseDollarsToCents } from '../../../lib/systems';

export const prerender = false;

// POST /api/systems/:id — update or delete a property-system row.
// Form field `action`: update | delete. Ownership mirrors contacts: a GM may
// only touch a system on their own property; admin/Strand are unrestricted.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const id = params.id;
  if (!id) return bounce(request, 'missing id');

  const row = await env.DB
    .prepare('SELECT id, property_id, service_type, vendor_name FROM property_systems WHERE id = ?')
    .bind(id)
    .first<{ id: string; property_id: string; service_type: string; vendor_name: string }>();
  if (!row) return bounce(request, 'System not found.');
  if (!canAccessProperty(user, row.property_id)) {
    return bounce(request, 'forbidden');
  }

  const form = await request.formData();
  const action = String(form.get('action') || '');

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM property_systems WHERE id = ?').bind(id).run();
    await logAudit(env.DB, user!.id, 'system.update', {
      detail: `delete ${row.property_id}: ${row.service_type} / ${row.vendor_name}`,
    });
    return back(request);
  }

  if (action === 'update') {
    // service_type may be reassigned (still must be in the controlled list);
    // vendor_name is required. Everything else is optional.
    const serviceType = String(form.get('service_type') || '').trim();
    const vendorName = String(form.get('vendor_name') || '').trim() || row.vendor_name;
    const type = SERVICE_TYPE_VALUES.includes(serviceType) ? serviceType : row.service_type;
    const status = String(form.get('status') || 'active') === 'cancelled' ? 'cancelled' : 'active';

    await env.DB
      .prepare(
        `UPDATE property_systems
            SET service_type = ?, vendor_name = ?, account_number = ?,
                contact_name = ?, contact_phone = ?, contact_email = ?,
                monthly_cost_cents = ?, contract_end = ?, cancel_notice = ?,
                status = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
      .bind(
        type,
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
        id
      )
      .run();

    await logAudit(env.DB, user!.id, 'system.update', {
      detail: `edit ${row.property_id}: ${type} / ${vendorName}`,
    });
    return back(request);
  }

  return bounce(request, 'Unknown action.');
};

function nz(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

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
