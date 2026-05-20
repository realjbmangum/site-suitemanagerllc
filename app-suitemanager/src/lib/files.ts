// Helpers shared by upload/download flows.

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
]);

export function sanitizeFilename(name: string): string {
  // Strip path separators, keep only safe characters.
  const base = name.replace(/^.*[\\/]/, '');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

export function categoryFromForm(value: unknown): 'invoice' | 'statement' | 'other' | null {
  const v = String(value || '').toLowerCase();
  if (v === 'invoice' || v === 'statement' || v === 'other') return v;
  return null;
}

export function fmtAmountCents(input: unknown): number | null {
  if (input == null) return null;
  const n = Number(String(input).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
