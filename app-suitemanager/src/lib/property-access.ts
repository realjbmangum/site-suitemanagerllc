// Can this user view/edit a given property's fact sheet + file library?
// Per the May 22 meeting: that property's GM, all Strand, all admins.

export function canAccessProperty(
  user: SessionUser | null | undefined,
  propertyId: string
): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'strand') return true;
  if (user.role === 'gm') return user.propertyId === propertyId;
  return false;
}

export const PROPERTY_FILE_CATEGORIES = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'qa', label: 'QA Report' },
  { value: 'license', label: 'License' },
  { value: 'permit', label: 'Permit' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
] as const;

const FILE_CAT_LABEL: Record<string, string> = Object.fromEntries(
  PROPERTY_FILE_CATEGORIES.map((c) => [c.value, c.label])
);
export function fileCategoryLabel(v: string): string {
  return FILE_CAT_LABEL[v] || v;
}
