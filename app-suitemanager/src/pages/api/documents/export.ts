import type { APIRoute } from 'astro';

export const prerender = false;

// GET /api/documents/export — CSV of the document queue, honoring the same
// filters as the dashboard. Strand/admin only. Opens directly in Excel.
export const GET: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const user = locals.user;
  if (!user || (user.role !== 'strand' && user.role !== 'admin')) {
    return new Response('forbidden', { status: 403 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'new';
  const category = url.searchParams.get('category') || 'all';
  const filter = url.searchParams.get('filter') || '';
  const propertyId = url.searchParams.get('property') || '';
  const payment = url.searchParams.get('payment') || '';
  const q = (url.searchParams.get('q') || '').trim();

  const where: string[] = [];
  const args: unknown[] = [];
  if (status !== 'all') { where.push('d.status = ?'); args.push(status); }
  if (category !== 'all') { where.push('d.category = ?'); args.push(category); }
  if (filter === 'pending') {
    where.push("d.category = 'invoice' AND d.payment_status = 'unpaid'");
  } else if (filter === 'today') {
    where.push("d.created_at >= datetime('now','-1 day')");
  } else if (filter === 'week') {
    where.push("d.created_at >= datetime('now','-7 day')");
  }
  if (propertyId === 'corporate') {
    where.push('d.property_id IS NULL');
  } else if (propertyId) {
    where.push('d.property_id = ?');
    args.push(propertyId);
  }
  if (payment === 'unpaid' || payment === 'paid') {
    where.push('d.payment_status = ?');
    args.push(payment);
  }
  if (q) {
    where.push("(LOWER(d.filename) LIKE ? OR LOWER(COALESCE(d.vendor,'')) LIKE ? OR LOWER(p.name) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    args.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await env.DB
    .prepare(
      `SELECT d.created_at, d.category, d.filename, d.vendor, d.invoice_number,
              d.amount_cents, d.note, d.status, d.payment_status,
              d.check_number, d.check_date,
              p.name AS property_name, u.name AS gm_name
       FROM documents d
       LEFT JOIN properties p ON p.id = d.property_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       ${whereSql}
       ORDER BY d.created_at DESC
       LIMIT 5000`
    )
    .bind(...args)
    .all<{
      created_at: string; category: string; filename: string;
      vendor: string | null; invoice_number: string | null;
      amount_cents: number | null; note: string | null;
      status: string; payment_status: string;
      check_number: string | null; check_date: string | null;
      property_name: string | null; gm_name: string | null;
    }>();

  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Received', 'Property', 'GM', 'Category', 'File', 'Vendor',
    'Invoice #', 'Amount', 'Status', 'Payment', 'Check #', 'Check Date', 'Note',
  ];
  const lines = [header.join(',')];
  for (const r of rows.results) {
    lines.push(
      [
        r.created_at,
        r.property_name || 'Corporate',
        r.gm_name || '',
        r.category,
        r.filename,
        r.vendor || '',
        r.invoice_number || '',
        r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : '',
        r.status,
        r.payment_status,
        r.check_number || '',
        r.check_date || '',
        r.note || '',
      ]
        .map(esc)
        .join(',')
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response('﻿' + lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="documents-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
