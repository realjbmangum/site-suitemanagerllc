// Canonical Fact Sheet ("Red Binder") template.
//
// Defines the standardized backbone every property's fact sheet ships with,
// derived (structure only — NOT values) from the two ASA source lists:
//   - "Who to Call List" → property_contacts (people / vendors / emergency_utility)
//   - "Password list"     → property_credentials
//
// applyTemplateToProperty() seeds a BLANK row for each entry into a property,
// idempotently: a row is only inserted if one with the same identity does not
// already exist (property_id + category + label for contacts; property_id +
// label for credentials). Re-running never duplicates.
//
// No-duplication rule: address, room_count, front-desk phone, fax,
// emergency_phone (24/7 GM cell) and property_email already live on the
// properties record / Overview tab — they are NOT re-captured here. The GM
// person row is the assigned user, shown read-only, not re-entered.

import { generateId } from './ids';

export type ContactCategory = 'people' | 'vendors' | 'emergency_utility';

export interface ContactTemplateEntry {
  category: ContactCategory;
  label: string;
}

export interface CredentialTemplateEntry {
  label: string;
}

// Who-to-Call directory. Ordered: people, then vendors, then emergency/utility.
export const CONTACT_TEMPLATE: ContactTemplateEntry[] = [
  // People (GM is shown read-only from the assigned user; Housekeeper is captured).
  { category: 'people', label: 'General Manager' },
  { category: 'people', label: 'Housekeeper' },

  // Vendors.
  { category: 'vendors', label: 'Alarm Monitoring' },
  { category: 'vendors', label: 'Security Cameras' },
  { category: 'vendors', label: 'Landscaper' },
  { category: 'vendors', label: 'Linen Company' },
  { category: 'vendors', label: 'Guest Supply' },
  { category: 'vendors', label: 'Lighted Signs & Lot Lights' },
  { category: 'vendors', label: 'HD Supply' },
  { category: 'vendors', label: 'Plumber' },
  { category: 'vendors', label: 'Onity / Ving Locksmith' },
  { category: 'vendors', label: 'Snow Removal' },
  { category: 'vendors', label: 'Guest Laundry Machines' },
  { category: 'vendors', label: 'Vending Machines' },
  { category: 'vendors', label: 'Paint & Drywall' },
  { category: 'vendors', label: 'HVAC Repair' },
  { category: 'vendors', label: 'Electrician' },

  // Emergency & Utilities.
  { category: 'emergency_utility', label: 'Police (Non-Emergency)' },
  { category: 'emergency_utility', label: 'Electric Company' },
  { category: 'emergency_utility', label: 'Gas Company' },
  { category: 'emergency_utility', label: 'Fire Alarm (Repairs)' },
  { category: 'emergency_utility', label: 'Fire Department (Non-Emergency)' },
  { category: 'emergency_utility', label: 'Internet & Phones' },
  { category: 'emergency_utility', label: 'Television / Cable' },
  { category: 'emergency_utility', label: 'Water / Sewer' },
  { category: 'emergency_utility', label: 'Backflow' },
  { category: 'emergency_utility', label: 'Trash' },
];

// Passwords / logins vault.
export const CREDENTIAL_TEMPLATE: CredentialTemplateEntry[] = [
  { label: 'Guest Supply' },
  { label: 'HD Supply' },
  { label: 'Expedia' },
  { label: 'Booking.com' },
  { label: 'Email' },
  { label: 'Computer' },
  { label: 'Onity Key Machine' },
  { label: 'Onity Programmer' },
  { label: 'Desk Phone Voicemail' },
  { label: 'Cell Phone Password' },
  { label: 'BrightLocal' },
  { label: 'Craigslist' },
  { label: 'Fire Alarm Code' },
  { label: 'Security Cameras' },
  { label: 'Guest Lock Boxes' },
];

// Seed the standardized template into one property. Idempotent: only inserts
// rows that don't already exist (matched on property_id + category + label for
// contacts, property_id + label for credentials). Seeded rows are blank
// (is_custom = 0); sort_order follows the template ordering.
export async function applyTemplateToProperty(
  db: D1Database,
  propertyId: string,
  userId: string
): Promise<{ contactsInserted: number; credentialsInserted: number }> {
  let contactsInserted = 0;
  let credentialsInserted = 0;

  for (let i = 0; i < CONTACT_TEMPLATE.length; i++) {
    const entry = CONTACT_TEMPLATE[i];
    const existing = await db
      .prepare(
        'SELECT id FROM property_contacts WHERE property_id = ? AND category = ? AND label = ?'
      )
      .bind(propertyId, entry.category, entry.label)
      .first<{ id: string }>();
    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO property_contacts
           (id, property_id, category, label, sort_order, is_custom, created_by)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      )
      .bind(generateId(), propertyId, entry.category, entry.label, i, userId)
      .run();
    contactsInserted++;
  }

  for (let i = 0; i < CREDENTIAL_TEMPLATE.length; i++) {
    const entry = CREDENTIAL_TEMPLATE[i];
    const existing = await db
      .prepare('SELECT id FROM property_credentials WHERE property_id = ? AND label = ?')
      .bind(propertyId, entry.label)
      .first<{ id: string }>();
    if (existing) continue;

    await db
      .prepare(
        `INSERT INTO property_credentials
           (id, property_id, label, sort_order, is_custom, created_by)
         VALUES (?, ?, ?, ?, 0, ?)`
      )
      .bind(generateId(), propertyId, entry.label, i, userId)
      .run();
    credentialsInserted++;
  }

  return { contactsInserted, credentialsInserted };
}
