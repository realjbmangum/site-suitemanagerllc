import type { APIRoute } from 'astro';
import { logAudit } from '../../../../lib/audit';

export const prerender = false;

// POST /api/resources/folders/:id — folder management.
// Form field `action`: rename | delete | reorder
//   rename  → name
//   reorder → dir (up | down)
//   delete  → (templates inside move to Unfiled; folder row removed)
export const POST: APIRoute = async ({ params, request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return bounce(request, 'forbidden');
  }
  const id = params.id;
  if (!id) return bounce(request, 'missing id');

  const form = await request.formData();
  const action = String(form.get('action') || '');

  const folder = await env.DB
    .prepare('SELECT id, name, sort_order FROM resource_folders WHERE id = ?')
    .bind(id)
    .first<{ id: string; name: string; sort_order: number }>();
  if (!folder) return bounce(request, 'Folder not found.');

  if (action === 'rename') {
    const name = String(form.get('name') || '').trim();
    if (!name) return bounce(request, 'Folder name is required.');
    await env.DB
      .prepare('UPDATE resource_folders SET name = ? WHERE id = ?')
      .bind(name, id)
      .run();
    await logAudit(env.DB, user.id, 'folder.rename', {
      detail: `${folder.name} → ${name}`,
    });
    return back(request, id);
  }

  if (action === 'delete') {
    // Non-destructive: templates move to Unfiled (folder_id = NULL).
    await env.DB.batch([
      env.DB.prepare('UPDATE resources SET folder_id = NULL WHERE folder_id = ?').bind(id),
      env.DB.prepare('DELETE FROM resource_folders WHERE id = ?').bind(id),
    ]);
    await logAudit(env.DB, user.id, 'folder.delete', { detail: folder.name });
    // Don't redirect back to the deleted folder.
    const url = new URL('/admin/templates', request.url);
    return new Response(null, { status: 302, headers: { location: url.toString() } });
  }

  if (action === 'reorder') {
    const dir = String(form.get('dir') || '');
    if (dir !== 'up' && dir !== 'down') return bounce(request, 'Bad direction.');
    // Find the adjacent folder by sort_order.
    const neighbor = await env.DB
      .prepare(
        dir === 'up'
          ? 'SELECT id, sort_order FROM resource_folders WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1'
          : 'SELECT id, sort_order FROM resource_folders WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1'
      )
      .bind(folder.sort_order)
      .first<{ id: string; sort_order: number }>();
    if (neighbor) {
      await env.DB.batch([
        env.DB.prepare('UPDATE resource_folders SET sort_order = ? WHERE id = ?').bind(neighbor.sort_order, folder.id),
        env.DB.prepare('UPDATE resource_folders SET sort_order = ? WHERE id = ?').bind(folder.sort_order, neighbor.id),
      ]);
    }
    return back(request, id);
  }

  return bounce(request, 'Unknown action.');
};

function back(request: Request, folderId: string): Response {
  const url = new URL('/admin/templates', request.url);
  url.searchParams.set('folder', folderId);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

function bounce(request: Request, msg: string): Response {
  const url = new URL('/admin/templates', request.url);
  url.searchParams.set('error', msg);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}
