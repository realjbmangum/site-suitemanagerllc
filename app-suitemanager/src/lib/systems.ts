// Systems & Technology — controlled service-type list shared by the corporate
// matrix page and the create/update API. Keeping this fixed (not free text) is
// what makes double-pay detection reliable: "two active vendors for the same
// property + service_type" only means something if the type is canonical.
//
// NOTE: scripts/import-systems.mjs and scripts/seed-systems-demo.mjs keep their
// own copy of the values/aliases (plain Node can't import this TS module).

export const SERVICE_TYPES = [
  { value: 'phone', label: 'Phone / Voice', short: 'Phone' },
  { value: 'isp', label: 'Internet / ISP', short: 'ISP' },
  { value: 'wifi_managed', label: 'Managed WiFi', short: 'WiFi' },
  { value: 'cable_tv', label: 'Cable / TV', short: 'Cable' },
  { value: 'cameras', label: 'Security Cameras', short: 'Cameras' },
  { value: 'alarm_fire', label: 'Alarm & Fire Monitoring', short: 'Alarm' },
  { value: 'door_locks', label: 'Door Locks (Onity)', short: 'Locks' },
  { value: 'pms', label: 'Property Mgmt System', short: 'PMS' },
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number]['value'];

export const SERVICE_TYPE_VALUES = SERVICE_TYPES.map((s) => s.value) as readonly string[];

const LABEL = new Map(SERVICE_TYPES.map((s) => [s.value, s.label]));
const SHORT = new Map(SERVICE_TYPES.map((s) => [s.value, s.short]));

export function serviceLabel(value: string): string {
  return LABEL.get(value) ?? value;
}
export function serviceShort(value: string): string {
  return SHORT.get(value) ?? value;
}

export const SYSTEM_STATUSES = ['active', 'cancelled'] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

// Cents → "$1,234.56" (matches the documents money formatter elsewhere).
export function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// "$1,234" / "1234.50" / "1,234" → integer cents (null on blank/garbage).
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export type PropertySystem = {
  id: string;
  property_id: string;
  service_type: string;
  vendor_name: string;
  account_number: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  monthly_cost_cents: number | null;
  contract_end: string | null;
  cancel_notice: string | null;
  status: string;
  notes: string | null;
};
