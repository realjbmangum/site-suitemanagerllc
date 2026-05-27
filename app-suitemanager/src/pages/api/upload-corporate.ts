import type { APIRoute } from 'astro';
import { generateId } from '../../lib/ids';
import { logAudit } from '../../lib/audit';
import {
  ALLOWED_MIME,
  categoryFromForm,
  CORPORATE_CATEGORIES,
  fmtAmountCents,
  sanitizeFilename,
} from '../../lib/files';
import { getApprovalThresholdCents } from '../../lib/settings';
import { buildApprovalRequestEmail } from '../../lib/email/templates';
import { trySend } from '../../lib/email/graph';

export const prerender = false;

// POST /api/upload-corporate — admin/strand uploads a Corporate document.
// Corporate docs are property_id = NULL: personal expense reports, mileage,
// special invoices to be paid. They flow into Strand's same queue but are
// never visible to a GM (whose queries always filter by their own property_id).
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');
  if (user.role !== 'admin' && user.role !== 'strand') {
    return bounce(request, 'Only Suite Manager admins and Strand can upload Corporate documents.');
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

  const category = categoryFromForm(form.get('category'), CORPORATE_CATEGORIES);
  if (!category) return bounce(request, 'Pick a document category.');

  const vendor = String(form.get('vendor') || '').trim() || null;
  let amount = fmtAmountCents(form.get('amount'));
  const note = String(form.get('note') || '').trim() || null;
  const invoiceNumber = String(form.get('invoice_number') || '').trim() || null;
  // Per-category fields. Date is YYYY-MM-DD from <input type="date">.
  const transactionDate = parseDateField(form.get('transaction_date'));
  const tripRoute = String(form.get('trip_route') || '').trim();
  let miles: number | null = null;

  // Per-category validation + derived fields.
  if (category === 'mileage') {
    const m = parseFloat(String(form.get('miles') || ''));
    const r = parseFloat(String(form.get('rate') || ''));
    if (!Number.isFinite(m) || m <= 0) return bounce(request, 'Miles driven is required for mileage.');
    if (!transactionDate) return bounce(request, 'Trip date is required for mileage.');
    if (!vendor) return bounce(request, 'Payee (driver name) is required for mileage.');
    miles = m;
    // Always recompute amount from miles × rate so it can't drift from the inputs.
    const rate = Number.isFinite(r) && r >= 0 ? r : 0.70;
    amount = Math.round(m * rate * 100);
  } else if (category === 'expense') {
    if (amount == null) return bounce(request, 'Total amount is required for expense reports.');
    if (!transactionDate) return bounce(request, 'Expense date is required.');
    if (!vendor) return bounce(request, 'Payee (employee name) is required for expense reports.');
  } else if (category === 'invoice') {
    if (amount == null) return bounce(request, 'Invoice amount is required.');
    if (!vendor) return bounce(request, 'Vendor is required for invoices.');
  }

  // Stash the mileage route in the note so we don't need yet another column.
  const finalNote = tripRoute && category === 'mileage'
    ? (note ? `${tripRoute} — ${note}` : tripRoute)
    : note;

  const documentId = generateId();
  const cleanName = sanitizeFilename(file.name);
  // Corporate R2 layout — no property prefix. Mirrors GM layout otherwise.
  const r2Key = `corporate/${category}/${documentId}-${cleanName}`;

  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Flag heuristic: very large file or `other` with no vendor — same as GM path.
  const flagged = file.size > 10 * 1024 * 1024 || (category === 'other' && !vendor) ? 1 : 0;

  // Approval gate applies to invoices at/above the threshold, same as GM uploads.
  const threshold = await getApprovalThresholdCents(env.DB);
  const approvalStatus =
    category === 'invoice' && amount != null && amount >= threshold
      ? 'pending'
      : 'not_required';

  await env.DB
    .prepare(
      `INSERT INTO documents
         (id, property_id, uploaded_by, category, vendor, invoice_number,
          amount_cents, note, miles, transaction_date,
          r2_key, filename, size_bytes, mime_type,
          status, flagged, approval_status)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
    )
    .bind(
      documentId,
      user.id,
      category,
      vendor,
      invoiceNumber,
      amount,
      finalNote,
      miles,
      transactionDate,
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
    detail: `corporate · ${category} · ${cleanName}`,
  });

  if (approvalStatus === 'pending') {
    await logAudit(env.DB, user.id, 'approval.requested', {
      documentId,
      detail: amount != null ? `$${(amount / 100).toFixed(2)}` : '',
    });

    const admins = await env.DB
      .prepare("SELECT email FROM users WHERE role = 'admin' AND active = 1 AND password_hash IS NOT NULL")
      .all<{ email: string }>();
    const adminEmails = admins.results.map((a) => a.email).filter(Boolean);
    if (adminEmails.length > 0) {
      const origin = new URL(request.url).origin;
      const mail = buildApprovalRequestEmail({
        propertyName: 'Corporate',
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

  const back = new URL('/corporate', request.url);
  back.searchParams.set('uploaded', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/corporate', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}

// <input type="date"> emits "YYYY-MM-DD". Reject anything else so we never
// store garbage. Returns null on missing/invalid.
function parseDateField(v: FormDataEntryValue | null): string | null {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
