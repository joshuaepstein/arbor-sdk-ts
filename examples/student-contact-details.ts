/**
 * A student's contact details: email addresses, phone numbers, postal
 * addresses, and their guardians' contact details. Read-only.
 *
 *   npx tsx examples/student-contact-details.ts [studentId]
 *
 * Contact details aren't fields on Student. They're separate resources that
 * point back to their owner (the Student itself, or a Guardian), so you query
 * each one with an "owner equals" filter.
 */
import {
  EmailAddress,
  PostalAddressOccupancy,
  Query,
  StudentGuardianRelationship,
  TelephoneNumber,
  type Guardian,
  type ModelBase,
  type Student,
} from '../src/index.js';
import { api } from './bootstrap.js';

/** Query `type` where `ownerProperty` equals `owner`, then load each result (listings only return references). */
async function ownedBy<T extends ModelBase>(type: string, ownerProperty: string, owner: ModelBase): Promise<T[]> {
  const refs = await api.query<T>(new Query(type).addPropertyFilter(ownerProperty, Query.OPERATOR_EQUALS, owner));
  return Promise.all(refs.map((r) => r.load()));
}

async function printContacts(owner: ModelBase, indent: string): Promise<void> {
  for (const e of await ownedBy<EmailAddress>('EmailAddress', EmailAddress.EMAIL_ADDRESS_OWNER, owner)) {
    console.log(`${indent}email: ${e.getEmailAddress()} (${e.getEmailAddressType()})`);
  }
  for (const t of await ownedBy<TelephoneNumber>('TelephoneNumber', TelephoneNumber.NUMBER_OWNER, owner)) {
    const ext = t.getExtensionNumber() ? ` ext ${t.getExtensionNumber()}` : '';
    console.log(`${indent}phone: ${t.getNumber()}${ext} (${t.getTelephoneNumberType()})`);
  }
}

const studentId = process.argv[2] ?? '4';
const student = await api.retrieve<Student>('Student', studentId);
const person = student.getPerson()!; // single-record responses include the person
console.log(`${person.getLegalFirstName()} ${person.getLegalLastName()} (${student.getResourceUrl()})`);

await printContacts(student, '  ');

for (const occupancy of await ownedBy<PostalAddressOccupancy>('PostalAddressOccupancy', PostalAddressOccupancy.OCCUPANT, student)) {
  const a = await occupancy.getPostalAddress()!.load();
  const lines = [a.getAddress1(), a.getAddress2(), a.getAddress3(), a.getPostalTown(), a.getPostalCode()].filter(Boolean);
  console.log(`  address: ${lines.join(', ')}${occupancy.getIsCorrespondenceAddress() ? ' (correspondence)' : ''}`);
}

console.log('\nGuardians:');
for (const rel of await ownedBy<StudentGuardianRelationship>('StudentGuardianRelationship', StudentGuardianRelationship.STUDENT, student)) {
  const guardian = (await rel.getGuardian()!.load()) as Guardian;
  const gp = guardian.getPerson();
  const flags = [rel.getIsPrimaryGuardian() && 'primary', rel.getIsLegalGuardian() && 'legal'].filter(Boolean).join(', ');
  console.log(`  ${gp?.getLegalFirstName()} ${gp?.getLegalLastName()}${flags ? ` (${flags})` : ''}`);
  await printContacts(guardian, '    ');
}
