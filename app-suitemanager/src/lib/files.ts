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

export type DocumentCategory = 'invoice' | 'statement' | 'other' | 'expense' | 'mileage';

const ALL_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['invoice', 'statement', 'other', 'expense', 'mileage'];

// Property uploads (GMs + admin-on-behalf) keep the original three.
export const PROPERTY_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['invoice', 'statement', 'other'];

// Corporate uploads (admin/strand) — no statement (those belong in Financials).
export const CORPORATE_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['invoice', 'expense', 'mileage', 'other'];

export function categoryFromForm(
  value: unknown,
  allowed: ReadonlyArray<DocumentCategory> = ALL_CATEGORIES,
): DocumentCategory | null {
  const v = String(value || '').toLowerCase() as DocumentCategory;
  return (allowed as ReadonlyArray<string>).includes(v) ? v : null;
}

export function fmtAmountCents(input: unknown): number | null {
  if (input == null) return null;
  const n = Number(String(input).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
