import type { APIRoute } from 'astro';
import { generateId } from '../../../lib/ids';
import { logAudit } from '../../../lib/audit';
import { sanitizeFilename, ALLOWED_MIME } from '../../../lib/files';

export const prerender = false;

// POST /api/resources/:id — template management.
// Form field `action`: update | replace | archive
//   update  → title, description, folder_id
//   replace → file (new version; old R2 object removed)
//   archive → (soft-hide; sets archived_at)
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, null, 'forbidden');
  }
  const id = params.id;
  if (!id) return bounce(request, null, 'missing id');

  const resource = await env.DB
    .prepare('SELECT id, folder_id, title, r2_key, version FROM resources WHERE id = ?')
    .bind(id)
    .first<{ id: string; folder_id: string | null; title: string; r2_key: string; version: number }>();
  if (!resource) return bounce(request, null, 'Template not found.');

  const form = await request.formData();
  const action = String(form.get('action') || '');

  if (action === 'update') {
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim() || null;
    const folderRaw = String(form.get('folder_id') || '').trim();
    const folderId = folderRaw === '' ? null : folderRaw;
    if (!title) return bounce(request, resource.folder_id, 'Title is required.');
    await env.DB
      .prepare('UPDATE resources SET title = ?, description = ?, folder_id = ? WHERE id = ?')
      .bind(title, description, folderId, id)
      .run();
    await logAudit(env.DB, user.id, 'resource.update', { resourceId: id, detail: title });
    return back(request, folderId);
  }

  if (action === 'archive') {
    await env.DB
      .prepare("UPDATE resources SET archived_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
    await logAudit(env.DB, user.id, 'resource.archive', {
      resourceId: id,
      detail: resource.title,
    });
    return back(request, resource.folder_id);
  }

  if (action === 'replace') {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return bounce(request, resource.folder_id, 'Choose a replacement file.');
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return bounce(request, resource.folder_id, `File type not allowed: ${file.type || 'unknown'}.`);
    }
    const max = parseInt(env.MAX_UPLOAD_BYTES || '26214400', 10) || 26214400;
    if (file.size > max) {
      return bounce(request, resource.folder_id, `File too large (max ${(max / 1024 / 1024).toFixed(0)} MB).`);
    }

    const cleanName = sanitizeFilename(file.name);
    const newKey = `resources/${resource.folder_id || 'unfiled'}/${generateId()}-${cleanName}`;
    await env.FILES.put(newKey, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    const oldKey = resource.r2_key;
    await env.DB
      .prepare(
        `UPDATE resources
         SET r2_key = ?, filename = ?, size_bytes = ?, mime_type = ?, version = version + 1
         WHERE id = ?`
      )
      .bind(newKey, cleanName, file.size, file.type, id)
      .run();

    // Remove the superseded blob (best-effort).
    if (oldKey && oldKey !== newKey) {
      env.FILES.delete(oldKey).catch(() => {});
    }

    await logAudit(env.DB, user.id, 'resource.replace', {
      resourceId: id,
      detail: `${resource.title} → v${resource.version + 1}`,
    });
    return back(request, resource.folder_id);
  }

  return bounce(request, resource.folder_id, 'Unknown action.');
};

function back(request: Request, folderId: string | null): Response {
  const url = new URL('/admin/templates', request.url);
  if (folderId) url.searchParams.set('folder', folderId);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

function bounce(request: Request, folderId: string | null, msg: string): Response {
  const url = new URL('/admin/templates', request.url);
  if (folderId) url.searchParams.set('folder', folderId);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
