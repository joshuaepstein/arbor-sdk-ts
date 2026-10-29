/**
 * A student's year group, form, contact details and guardians. Read-only.
 *
 *   npx tsx examples/student-contact-details.ts <studentId>
 *
 * Parts the app isn't allowed to read are listed as "not available" instead
 * of failing the whole lookup.
 */
import type { ContactDetails } from '../src/index.js';
import { api } from './bootstrap.js';

const studentId = process.argv[2];
if (!studentId) {
  console.error('Usage: npx tsx examples/student-contact-details.ts <studentId>');
  process.exit(1);
}

function printContacts(c: ContactDetails, indent: string): void {
  for (const e of c.emails) console.log(`${indent}email:   ${e.address} (${e.type ?? '-'})`);
  for (const p of c.phones) console.log(`${indent}phone:   ${p.number}${p.extension ? ` ext ${p.extension}` : ''} (${p.type ?? '-'})`);
  for (const a of c.addresses) {
    console.log(`${indent}address: ${[...a.lines, a.postcode].filter(Boolean).join(', ')}${a.isCorrespondenceAddress ? ' (correspondence)' : ''}`);
  }
  for (const u of c.unavailable) console.log(`${indent}${u.part}: not available (${u.reason})`);
}

const [yearGroup, form, contacts, guardians] = await Promise.all([
  api.getYearGroup(studentId),
  api.getCurrentForm(studentId),
  api.getContactDetails(studentId),
  api.getGuardians(studentId, { contacts: true }),
]);

console.log(`Student ${studentId}: ${yearGroup?.getAcademicLevelName() ?? 'no year group'}, form ${form?.getRegistrationFormName() ?? '-'}`);
printContacts(contacts, '  ');

console.log('\nGuardians:');
for (const g of guardians) {
  const flags = [g.isPrimary && 'primary', g.isLegal && 'legal'].filter(Boolean).join(', ');
  console.log(`  ${g.name ?? '(name not available)'}, ${g.relationship ?? 'relationship unknown'}${flags ? ` (${flags})` : ''}`);
  if (g.contacts) printContacts(g.contacts, '    ');
}
