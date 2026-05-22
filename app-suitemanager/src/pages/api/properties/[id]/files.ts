import type { APIRoute } from 'astro';
import { generateId } from '../../../../lib/ids';
import { logAudit } from '../../../../lib/audit';
import { ALLOWED_MIME, sanitizeFilename } from '../../../../lib/files';
import { canAccessProperty } from '../../../../lib/property-access';

export const prerender = false;

const VALID_CATEGORIES = new Set([
  'inspection', 'qa', 'license', 'permit', 'contract', 'other',
]);

// POST /api/properties/:id/files — upload a property reference document.
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  const propertyId = params.id;
  if (!propertyId) return bounce(request, propertyId, 'missing id');
  if (!canAccessProperty(user, propertyId)) {
    return bounce(request, propertyId, 'forbidden');
  }

  const form = await request.formData();
  const file = form.get('file');
  const category = String(form.get('category') || '').trim();
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim() || null;
  const expiresAt = String(form.get('expires_at') || '').trim() || null;

  if (!(file instanceof File) || file.size === 0) return bounce(request, propertyId, 'Choose a file.');
  if (!VALID_CATEGORIES.has(category)) return bounce(request, propertyId, 'Pick a category.');
  if (!title) return bounce(request, propertyId, 'Title is required.');
  if (!ALLOWED_MIME.has(file.type)) {
    return bounce(request, propertyId, `File type not allowed: ${file.type || 'unknown'}.`);
  }
  const max = parseInt(env.MAX_UPLOAD_BYTES || '26214400', 10) || 26214400;
  if (file.size > max) {
    return bounce(request, propertyId, `File too large (max ${(max / 1024 / 1024).toFixed(0)} MB).`);
  }

  const id = generateId();
  const cleanName = sanitizeFilename(file.name);
  const r2Key = `properties/${propertyId}/files/${category}/${id}-${cleanName}`;

  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  await env.DB
    .prepare(
      `INSERT INTO property_files
         (id, property_id, uploaded_by, category, title, description, expires_at,
          r2_key, filename, size_bytes, mime_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, propertyId, user!.id, category, title, description, expiresAt,
      r2Key, cleanName, file.size, file.type
    )
    .run();

  await logAudit(env.DB, user!.id, 'propertyfile.upload', { detail: `${category} · ${title}` });
  return back(request, propertyId);
};

function back(request: Request, propertyId: string | undefined): Response {
  const url = new URL(request.headers.get('referer') || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.delete('error');
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
function bounce(request: Request, propertyId: string | undefined, msg: string): Response {
  const url = new URL(request.headers.get('referer') || (propertyId ? `/admin/properties/${propertyId}` : '/'), request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
