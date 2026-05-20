import type { APIRoute } from 'astro';
import { generateId } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';
import { sanitizeFilename } from '../../../lib/files';

export const prerender = false;

// POST /api/resources — HR/admin uploads a template into a folder.
// Form: folder_id, title, description?, file
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user) return bounce(request, 'unauthorized');
  if (user.role !== 'hr' && user.role !== 'admin') {
    return bounce(request, 'Only HR or admin can upload templates.');
  }

  const form = await request.formData();
  const folderId = String(form.get('folder_id') || '').trim() || null;
  const title = String(form.get('title') || '').trim();
  const description = String(form.get('description') || '').trim() || null;
  const file = form.get('file');

  if (!title) return bounce(request, 'Title is required.');
  if (!(file instanceof File) || file.size === 0) {
    return bounce(request, 'Please choose a file.');
  }

  const resourceId = generateId();
  const cleanName = sanitizeFilename(file.name);
  const r2Key = `resources/${folderId || 'unfiled'}/${resourceId}-${cleanName}`;

  await env.FILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  await env.DB
    .prepare(
      `INSERT INTO resources
         (id, folder_id, title, description, r2_key, filename, size_bytes, mime_type, uploaded_by, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .bind(
      resourceId,
      folderId,
      title,
      description,
      r2Key,
      cleanName,
      file.size,
      file.type,
      user.id
    )
    .run();

  await logAudit(env.DB, user.id, 'resource.upload', {
    resourceId,
    detail: title,
  });

  const back = new URL('/admin/templates', request.url);
  if (folderId) back.searchParams.set('folder', folderId);
  back.searchParams.set('uploaded', '1');
  return new Response(null, { status: 302, headers: { location: back.toString() } });
};

function bounce(request: Request, msg: string): Response {
  const back = new URL('/admin/templates', request.url);
  back.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: back.toString() } });
}
