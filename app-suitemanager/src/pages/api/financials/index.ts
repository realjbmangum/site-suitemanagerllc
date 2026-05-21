import type { APIRoute } from 'astro';
import { generateId } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';
import { sanitizeFilename } from '../../../lib/files';

export const prerender = false;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const VALID_TYPES = new Set([
  'profit_loss',
  'balance_sheet',
  'cash_flow',
  'budget',
  'other',
]);

// POST /api/financials — Strand/admin uploads a financial statement.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, 'forbidden');
  }

  const form = await request.formData();
  const file = form.get('file');
  const propertyId = String(form.get('property_id') || '').trim();
  const statementType = String(form.get('statement_type') || '').trim();
  const periodYear = parseInt(String(form.get('period_year') || ''), 10);
  const periodMonthRaw = String(form.get('period_month') || '').trim();
  const periodMonth = periodMonthRaw === '' || periodMonthRaw === '0'
    ? null
    : parseInt(periodMonthRaw, 10);
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim() || null;

  if (!(file instanceof File) || file.size === 0)
    return bounce(request, 'Choose a file.');
  if (!propertyId) return bounce(request, 'Pick a property.');
  if (!VALID_TYPES.has(statementType))
    return bounce(request, 'Pick a statement type.');
  if (!Number.isFinite(periodYear) || periodYear < 2000 || periodYear > 2100)
    return bounce(request, 'Period year is invalid.');
  if (
    periodMonth != null &&
    (!Number.isFinite(periodMonth) || periodMonth < 1 || periodMonth > 12)
  ) {
    return bounce(request, 'Period month is invalid.');
  }
  if (!ALLOWED_MIME.has(file.type))
    return bounce(request, `File type not allowed: ${file.type || 'unknown'}.`);

  const max = parseInt(env.MAX_UPLOAD_BYTES || '26214400', 10) || 26214400;
  if (file.size > max)
    return bounce(request, `File too large (max ${(max / 1024 / 1024).toFixed(0)} MB).`);

  // Verify property exists.
  const prop = await env.DB
    .prepare('SELECT id FROM properties WHERE id = ?')
    .bind(propertyId)
    .first();
  if (!prop) return bounce(request, 'Property not found.');

  const id = generateId();
  const cleanName = sanitizeFilename(file.name);
  const monthSeg = periodMonth ? String(periodMonth).padStart(2, '0') : 'annual';
  const r2Key = `properties/${propertyId}/financials/${periodYear}/${monthSeg}/${statementType}/${id}-${cleanName}`;

  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Default title if not provided.
  const finalTitle =
    title ||
    [statementType.replace('_', ' '), periodYear, periodMonth ? `· ${periodMonth}` : '']
      .filter(Boolean)
      .join(' ')
      .trim();

  await env.DB
    .prepare(
      `INSERT INTO financial_statements
         (id, property_id, uploaded_by, statement_type, period_year, period_month,
          title, description, r2_key, filename, size_bytes, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      propertyId,
      user.id,
      statementType,
      periodYear,
      periodMonth,
      finalTitle,
      description,
      r2Key,
      cleanName,
      file.size,
      file.type
    )
    .run();

  await logAudit(env.DB, user.id, 'financials.upload', {
    detail: `${statementType} · ${finalTitle}`,
  });

  const back = new URL('/admin/financials', request.url);
  back.searchParams.set('property', propertyId);
  back.searchParams.set('uploaded', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/financials', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
