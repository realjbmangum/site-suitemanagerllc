import type { APIRoute } from 'astro';
import { logAudit } from '../../../lib/audit';
import { canAccessProperty } from '../../../lib/property-access';

export const prerender = false;

// POST /api/contacts/:id — update or delete a contact row.
// Form field `action`: update | delete
// Ownership mirrors documents/download: a GM may only touch a contact on their
// own property; admin/Strand are unrestricted (enforced by canAccessProperty).
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const id = params.id;
  if (!id) return bounce(request, null, 'missing id');

  const contact = await env.DB
    .prepare('SELECT id, property_id, label, is_custom FROM property_contacts WHERE id = ?')
    .bind(id)
    .first<{ id: string; property_id: string; label: string; is_custom: number }>();
  if (!contact) return bounce(request, null, 'Contact not found.');
  if (!canAccessProperty(user, contact.property_id)) {
    return bounce(request, contact.property_id, 'forbidden');
  }

  const form = await request.formData();
  const action = String(form.get('action') || '');

  if (action === 'delete') {
    await env.DB.prepare('DELETE FROM property_contacts WHERE id = ?').bind(id).run();
    await logAudit(env.DB, user!.id, 'contact.update', {
      resourceId: contact.property_id,
      detail: `delete: ${contact.label}`,
    });
    return back(request, contact.property_id);
  }

  if (action === 'update') {
    // Label stays editable (custom rows can be renamed; seeded rows keep their
    // canonical label but editing is allowed). All typed fields are optional.
    const label = String(form.get('label') || '').trim() || contact.label;
    const contactName = nz(form.get('contact_name'));
    const phone = nz(form.get('phone'));
    const mobile = nz(form.get('mobile'));
    const email = nz(form.get('email'));
    const accountNumber = nz(form.get('account_number'));
    const fax = nz(form.get('fax'));

    await env.DB
      .prepare(
        `UPDATE property_contacts
            SET label = ?, contact_name = ?, phone = ?, mobile = ?, email = ?,
                account_number = ?, fax = ?, updated_at = datetime('now')
          WHERE id = ?`
      )
      .bind(label, contactName, phone, mobile, email, accountNumber, fax, id)
      .run();

    await logAudit(env.DB, user!.id, 'contact.update', {
      resourceId: contact.property_id,
      detail: `edit: ${label}`,
    });
    return back(request, contact.property_id);
  }

  return bounce(request, contact.property_id, 'Unknown action.');
};

function nz(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function back(request: Request, propertyId: string | null): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | null, msg: string): Response {
  const ref = request.headers.get('referer');
  const url = new URL(ref || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
