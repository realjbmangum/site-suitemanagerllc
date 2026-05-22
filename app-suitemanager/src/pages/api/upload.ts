import type { APIRoute } from 'astro';
import { generateId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import {
  ALLOWED_MIME,
  categoryFromForm,
  fmtAmountCents,
  sanitizeFilename,
} from '../../lib/files';
import { getApprovalThresholdCents } from '../../lib/settings';
import { buildApprovalRequestEmail } from '../../lib/email/templates';
import { trySend } from '../../lib/email/graph';

export const prerender = false;

// POST /api/upload — GM uploads a document for their property.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');
  if (user.role !== 'gm' && user.role !== 'admin') {
    return bounce(request, 'Only GMs can upload documents.');
  }

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return bounce(request, 'Please choose a file to upload.');
  }

  const max = parseInt(env.MAX_UPLOAD_BYTES || '26214400', 10) || 26214400;
  if (file.size > max) {
    return bounce(request, `File is too large (max ${(max / (1024 * 1024)).toFixed(0)} MB).`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return bounce(request, `File type not allowed: ${file.type || 'unknown'}.`);
  }

  const category = categoryFromForm(form.get('category'));
  if (!category) return bounce(request, 'Pick a document category.');

  // GMs upload to their own property. Admin testing uses a property_id field.
  const propertyId =
    user.role === 'admin'
      ? String(form.get('property_id') || '') || null
      : user.propertyId;
  if (!propertyId) {
    return bounce(
      request,
      user.role === 'admin'
        ? 'Admin uploads need a property_id field for testing.'
        : 'Your account is not assigned to a property yet — ask your admin.'
    );
  }

  const vendor = String(form.get('vendor') || '').trim() || null;
  const amount = fmtAmountCents(form.get('amount'));
  const note = String(form.get('note') || '').trim() || null;
  const invoiceNumber = String(form.get('invoice_number') || '').trim() || null;

  const documentId = generateId();
  const cleanName = sanitizeFilename(file.name);
  // Property-scoped layout — keeps R2 permissions / browsing clean.
  // properties/{propertyId}/gm-uploads/{category}/...
  // Other doc kinds (financials, etc.) sit alongside gm-uploads under the property.
  const r2Key = `properties/${propertyId}/gm-uploads/${category}/${documentId}-${cleanName}`;

  // Stream to R2.
  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Flag heuristic: very large file or `other` category with no vendor.
  const flagged = file.size > 10 * 1024 * 1024 || (category === 'other' && !vendor) ? 1 : 0;

  // Approval gate: invoices at/above the threshold need sign-off.
  const threshold = await getApprovalThresholdCents(env.DB);
  const approvalStatus =
    category === 'invoice' && amount != null && amount >= threshold
      ? 'pending'
      : 'not_required';

  await env.DB
    .prepare(
      `INSERT INTO documents
         (id, property_id, uploaded_by, category, vendor, invoice_number,
          amount_cents, note, r2_key, filename, size_bytes, mime_type,
          status, flagged, approval_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    )
    .bind(
      documentId,
      propertyId,
      user.id,
      category,
      vendor,
      invoiceNumber,
      amount,
      note,
      r2Key,
      cleanName,
      file.size,
      file.type,
      flagged,
      approvalStatus
    )
    .run();

  await logAudit(env.DB, user.id, 'upload', {
    documentId,
    detail: `${category} · ${cleanName}`,
  });

  if (approvalStatus === 'pending') {
    await logAudit(env.DB, user.id, 'approval.requested', {
      documentId,
      detail: amount != null ? `$${(amount / 100).toFixed(2)}` : '',
    });

    // Email every admin an approval link (best-effort).
    const admins = await env.DB
      .prepare("SELECT email FROM users WHERE role = 'admin' AND active = 1 AND password_hash IS NOT NULL")
      .all<{ email: string }>();
    const prop = await env.DB
      .prepare('SELECT name FROM properties WHERE id = ?')
      .bind(propertyId)
      .first<{ name: string }>();
    const adminEmails = admins.results.map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      const origin = new URL(request.url).origin;
      const mail = buildApprovalRequestEmail({
        propertyName: prop?.name || 'Unknown property',
        vendor,
        amountFormatted:
          amount != null
            ? `$${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
            : '—',
        invoiceNumber,
        uploadedByName: user.name,
        reviewUrl: `${origin}/dashboard/${documentId}`,
      });
      await trySend(env, { to: adminEmails, subject: mail.subject, html: mail.html });
    }
  }

  const back = new URL('/upload', request.url);
  back.searchParams.set('uploaded', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/upload', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
