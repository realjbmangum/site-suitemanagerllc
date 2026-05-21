// Shared metadata for financial-statement uploads.

export const STATEMENT_TYPES = [
  { value: 'profit_loss', label: 'P&L' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'cash_flow', label: 'Cash Flow' },
  { value: 'budget', label: 'Budget' },
  { value: 'other', label: 'Other' },
] as const;

export type StatementType = (typeof STATEMENT_TYPES)[number]['value'];

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  STATEMENT_TYPES.map((t) => [t.value, t.label])
);

export function typeLabel(v: string): string {
  return TYPE_LABEL[v] || v;
}

export const MONTH_LABELS = [
  'Annual',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function periodLabel(year: number, month: number | null): string {
  if (month == null || month < 1 || month > 12) return String(year);
  return `${MONTH_LABELS[month]} ${year}`;
}
