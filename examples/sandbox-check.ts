/**
 * Read-only smoke test against a sandbox. Only GET requests; nothing is changed.
 *
 *   npm run sandbox:check
 *
 * Checks the behaviours the TS port copied from the PHP SDK without docs:
 *   1. listing URLs (/rest-v2/Students) work
 *   2. single-record URLs (/rest-v2/students/{id}) work
 *   3. the base URL / auth / JSON headers are accepted
 *   4. date strings parse into Date objects
 */
import { Collection, Query, ResourceType, type Student } from '../src/index.js';

process.env.ARBOR_DEBUG ??= '1'; // log each request so failures show what was called
const { api } = await import('./bootstrap.js');

let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string, e?: unknown) => {
  failures++;
  console.log(`  ✗ ${msg}${e ? `\n      ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}` : ''}`);
};

console.log('\n1. Listing (query) request');
let students: Collection<Student> = new Collection();
try {
  // No page size: Arbor's paging can return short or empty pages (see Query.setPageSize).
  students = await api.query<Student>(new Query(ResourceType.STUDENT));
  if (students.length > 0) ok(`got ${students.length} student(s)`);
  else fail('request succeeded but returned no students (empty sandbox, or wrong listing URL / root key?)');
} catch (e) {
  fail('listing request failed', e);
}

console.log('\n2. Single-record (retrieve) request');
const id = students[0]?.getResourceId();
if (!id) {
  fail('skipped: no student id from step 1');
} else {
  try {
    const student = await api.retrieve<Student>(ResourceType.STUDENT, id);
    ok(`retrieved ${student.getResourceUrl()} (${student.getDisplayName() ?? 'no displayName'})`);
    ok(`${Object.keys(student.getProperties()).length} properties loaded`);

    console.log('\n3. Related-model load (student → person)');
    const person = student.getPerson();
    if (!person) fail('student has no person property');
    else {
      await person.load();
      ok(`person ${person.getResourceUrl()} loaded: ${person.getLegalFirstName()} ${person.getLegalLastName()}`);

      console.log('\n4. Date parsing');
      const raw = person.getProperty('dateOfBirth');
      const dob = person.getDateOfBirth();
      if (raw === null) ok('person has no dateOfBirth to check');
      else if (dob instanceof Date && !Number.isNaN(dob.getTime())) ok(`getDateOfBirth(): ${JSON.stringify(raw)} → ${dob.toDateString()}`);
      else fail(`could not parse dateOfBirth ${JSON.stringify(raw)}`);
    }
  } catch (e) {
    fail('retrieve failed', e);
  }
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exitCode = failures ? 1 : 0;
