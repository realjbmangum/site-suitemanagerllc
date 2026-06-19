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

export type DocumentCategory =
  | 'invoice' | 'statement' | 'other' | 'expense' | 'mileage' | 'deposit_slip';

// All categories the system understands. Legacy values (invoice/statement)
// stay here so existing documents remain valid; they're just no longer offered
// on the GM-submission side. The DB no longer enforces a CHECK on category —
// validation happens here via categoryFromForm.
const ALL_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['invoice', 'statement', 'other', 'expense', 'mileage', 'deposit_slip'];

// GM → Strand workflow (property uploads). Per Julie/Strand (Jun 2026):
// accounting docs route elsewhere; the manager queue is deposit slips + other.
export const PROPERTY_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['deposit_slip', 'other'];

// Corporate uploads (admin/strand, e.g. Chris housing staff docs + expenses).
// Kept broad on purpose — Chris uses this side beyond the GM queue.
export const CORPORATE_CATEGORIES: ReadonlyArray<DocumentCategory> =
  ['invoice', 'expense', 'mileage', 'other'];

export const CATEGORY_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  statement: 'Statement',
  expense: 'Expense',
  mileage: 'Mileage',
  deposit_slip: 'Deposit Slip',
  other: 'Other',
};

export function categoryLabel(c: string): string {
  return CATEGORY_LABELS[c] || c;
}

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
