/**
 * Looks up a student's name, email address and profile picture. Read-only.
 *
 *   npx tsx examples/student-profile.ts <studentId>
 *
 * - Name: on the student's Person, which comes back with the student.
 * - Email: a separate EmailAddress resource owned by the student.
 * - Photo: downloaded from /rest-v2/profile-picture/student/{id} and saved to
 *   photos/student-<id>.<ext>. Needs the `content` and `contentTag` permissions.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { EmailAddress, Query, ResourceNotFoundError, type Student } from '../src/index.js';
import { api } from './bootstrap.js';

const studentId = process.argv[2];
if (!studentId) {
  console.error('Usage: npx tsx examples/student-profile.ts <studentId>');
  process.exit(1);
}

// 1. Student and name
let student: Student;
try {
  student = await api.retrieve<Student>('Student', studentId);
} catch (e) {
  if (e instanceof ResourceNotFoundError) {
    console.error(`No student with id ${studentId}`);
    process.exit(1);
  }
  throw e;
}
const person = student.getPerson();
const legal = [person?.getLegalFirstName(), person?.getLegalLastName()].filter(Boolean).join(' ');
const preferred = [person?.getPreferredFirstName(), person?.getPreferredLastName()].filter(Boolean).join(' ');

console.log(`Student:   ${student.getResourceUrl()}`);
if (!person?.getResourceUrl()) {
  // The API returns `person: { entityType: 'Person' }` with no href or fields when the app can't read Person.
  console.log('Name:      (hidden: this app has no permission to read Person records)');
} else {
  console.log(`Name:      ${legal || '(blank)'}${preferred && preferred !== legal ? ` (preferred: ${preferred})` : ''}`);
}

// 2. Email address(es)
const emailRefs = await api.query<EmailAddress>(
  new Query('EmailAddress').addPropertyFilter(EmailAddress.EMAIL_ADDRESS_OWNER, Query.OPERATOR_EQUALS, student),
);
const emails = await Promise.all(emailRefs.map((e) => e.load())); // listings only return references
if (emails.length === 0) console.log('Email:     (none on record)');
for (const e of emails) console.log(`Email:     ${e.getEmailAddress()} (${e.getEmailAddressType() ?? 'no type'})`);

// 3. Profile picture (needs the `content` and `contentTag` API permissions)
const picture = await api.getProfilePicture(student);
if (!picture) {
  console.log('Photo:     (none on record)');
} else {
  // Saved under photos/, which is gitignored: these are pupil photos.
  await mkdir('photos', { recursive: true });
  const file = `photos/student-${studentId}.${picture.extension}`;
  await writeFile(file, picture.data);
  console.log(`Photo:     saved ${file} (${picture.contentType}, ${(picture.data.length / 1024).toFixed(1)} KB)`);
}
