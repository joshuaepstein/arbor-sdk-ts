# Arbor TypeScript SDK

> **Unofficial.** This is a community port. Arbor Education doesn't make, maintain or support it. For the official SDK, see [sis-sdk-php](https://github.com/arbor-education/sis-sdk-php).

A TypeScript port of the [Arbor Education PHP SDK](https://github.com/arbor-education/sis-sdk-php) for the Arbor REST API (`/rest-v2`).

It has the same building blocks as the PHP SDK: a gateway for CRUD, queries, changelogs, bulk creation and uploads; a `Query` builder; and typed classes for all 910 Arbor resources (including the `UkDfe`, `UkIlr`, `UkJcq`, `Cymru` and `Cayman` modules).

- No runtime dependencies. It uses the built-in `fetch`, so it runs on Node 18+, Bun, Deno and edge runtimes.
- Ships ESM and CommonJS builds with full type definitions.
- Models are generated from the PHP SDK, so they stay in step with upstream (see [Regenerating models](#regenerating-models)).

## Install

```sh
npm install @joshepstein/arbor-sdk-ts
```

Get API credentials for a sandbox from the [Arbor Developers Portal](https://developers-portal.arbor.sc).

## Quick start

```ts
import { createClient, Student, Person, Query, ResourceType } from '@joshepstein/arbor-sdk-ts';

const api = createClient({
  baseUrl: 'https://api-sandbox2.uk.arbor.sc', // a trailing /rest-v2 is fine too
  user: process.env.ARBOR_USER!,
  password: process.env.ARBOR_PASSWORD!,
  // applicationId: 'your-app-id',           // sent as x-mis-application-id
});

// GET
const student = await Student.retrieve(16);
console.log(student.getDisplayName());

// Query
const query = new Query(ResourceType.PERSON)
  .addPropertyFilter(Person.LEGAL_LAST_NAME, Query.OPERATOR_EQUALS, 'Adams');
const people = await api.query<Person>(query);  // or: await Person.query(query)

// POST
const person = new Person();
person.setLegalFirstName('Ada');
person.setLegalLastName('Lovelace');
person.setDateOfBirth(new Date(2010, 0, 1));
await person.save();

// PUT (only changed fields are sent)
person.setPreferredFirstName('Addy');
await person.save();

// DELETE
await api.delete(person);
```

`createClient()` sets the gateway as the default for every model, which is what makes `Student.retrieve()`, `Model.query()` and `model.save()` work. Pass `setAsDefault: false` to opt out, or build the pieces yourself:

```ts
import { HttpClient, RestGateway, ModelBase } from '@joshepstein/arbor-sdk-ts';

const http = new HttpClient({ baseUrl, user, password, timeoutMs: 30_000 });
const api = new RestGateway(http);
ModelBase.setDefaultGateway(api);
```

## Differences from the PHP SDK

| PHP | TypeScript |
| --- | --- |
| `PsrRestGateway` + PSR-18 client discovery | `RestGateway` + `HttpClient` on `fetch` (inject your own with `fetch:`) |
| Synchronous calls | Every network call returns a `Promise` |
| Getters lazy-load missing data | Getters return what's loaded, or `null`. Call `await model.load()` or `await model.fetchProperty('name')` to fetch |
| `\DateTime` | `Date`. The API returns dates as strings (`"2010-11-20 00:00:00"`); typed getters such as `getDateOfBirth()` parse them in local time. `getProperty()` returns the raw string |
| `Arbor\Model\UkDfe\Student` | `UkDfe.Student` (module namespaces) |
| `Arbor\Resource\UkDfe\ResourceType::X` | `UkDfeResourceType.X` |
| `Collection` (ArrayObject) | `Collection` (an `Array` subclass with `add()` and `getArrayCopy()`) |
| `ArrayObject` user tags | Plain object |
| `serialize()` / `unserialize()` | `JSON.stringify(model)` / `ModelBase.fromJSON(json)` |
| `ServerErrorException`, `ResourceNotFoundException`, … | `ServerError`, `ResourceNotFoundError`, … (all extend `ArborError`) |
| `findAll($type, [$prop => [$op, $value]])` | `findAll(type, { prop: [op, value] })` |

### Related models need an explicit load

When the API returns a related resource as a reference (only `entityType` and `href`), PHP fetches the rest the first time you call a getter on it. JavaScript getters can't wait on the network, so load it yourself:

```ts
const student = await Student.retrieve(16);
const person = student.getPerson();
await person?.load();
console.log(person?.getLegalFirstName());
```

### Small behaviour changes

- JSON requests send `Content-Type: application/json` and `Accept: application/json`. PHP sent neither header.
- A trailing `/rest-v2` on `baseUrl` is removed, so you don't end up with `/rest-v2/rest-v2/...` (the PHP example config has this problem).
- `update()` sends whole arrays when an array property changes, not the sparse arrays PHP produced.
- Bulk-create's duplicate check no longer adds an empty `userTags` to the payload.
- `model.delete()` exists as a shortcut for `gateway.delete(model)`.
- `HttpClient` takes an optional `timeoutMs`.

## Query options

```ts
// Listings only return references (id + href). `load: true` fetches each full record.
const rooms = await Room.query(new Query(), { load: true });

// Only records that haven't ended: the end date is after now, or empty (ongoing).
const enrolments = await api.query(
  new Query('AcademicUnitEnrolment').addPropertyFilter('student', 'equals', student),
  { current: true, load: true },
);

// A different end-date property, or a different moment:
await api.query(q, { current: { endProperty: 'endDatetime', at: new Date('2026-12-01') } });

// Load models you already have:
await api.loadAll(models);
```

`current` sends two requests (end date after `at`, and end date empty) and merges them. Arbor's `endDate.after` filter on its own silently drops ongoing records: a teacher with 72 current timetable slots gets back 7. Records that start in the future are included.

## Rate limits and paging

Arbor rate-limits by request volume (HTTP 429). Its block can last over a minute, and it doesn't send a `Retry-After` header. The HTTP client handles this for you:

- **Paced:** at most 10 requests start per second, and at most 4 run at once. `Promise.all(refs.map((r) => r.load()))` is safe even for hundreds of records; it just takes longer.
- **Retried:** 429 and 503 responses are retried up to 5 times, backing off 2s, 4s, 8s, 16s, 32s (or the `Retry-After` delay if Arbor sends one).
- **Paused together:** while one request is backing off, every other request waits too, so the client stops adding to the burst.

```ts
createClient({
  baseUrl, user, password,
  maxRequestsPerSecond: 5,   // default 10
  maxConcurrentRequests: 2,  // default 4
  maxRetries: 6,             // default 5
  retryBaseDelayMs: 3000,    // default 2000
});
```

### Caching

Identical requests that are already in flight are always merged. If 20 lessons load the same room at once, it's fetched once.

You can also keep single records for a while (`retrieve()`, `load()` / `refresh()`). This helps when many records point to the same rooms, classes or staff:

```ts
const api = createClient({ baseUrl, user, password, cacheTtlMs: 5 * 60_000 });
api.clearCache();                    // drop everything
api.clearCache('/rest-v2/rooms/98'); // drop one record
```

The cache is off by default. Saving or deleting a record through the gateway clears its entry, and `update()` always compares against a fresh copy from the server. List queries are never cached.

**Avoid `page-size`.** Arbor appears to filter out rows you can't see *after* cutting a page, so paged results come back short or even empty. In testing, a student with 189 enrolments returned 50 rows at `page-size=50`, 89 at 100 and **0** at 200. Leave `setPageSize()` unset: a query then returns every matching row in one response.

## Errors

```ts
import { ServerError, ResourceNotFoundError } from '@joshepstein/arbor-sdk-ts';

try {
  await api.bulkCreate(ResourceType.PERSON, people);
} catch (e) {
  if (e instanceof ResourceNotFoundError) { /* 404 */ }
  if (e instanceof ServerError) {
    console.error(e.status, e.serverExceptionClass, e.serverExceptionMessage);
    console.error(e.responsePayload); // per-item results for bulk requests
  }
}
```

Responses with status 200, 201, 204 or 422 are returned. A 422 comes back as a normal response with the validation details in the payload, as in PHP. If the JSON body has its own `response.code`, that code wins over the HTTP status.

## More features

### Changelog

```ts
const changes = await api.getChanges<Student>(ResourceType.STUDENT, fromRevision, toRevision);
for (const c of changes) console.log(c.getChangeType(), c.getChangedResource().getResourceUrl());
```

### Bulk create

```ts
const created = await api.bulkCreate(ResourceType.STUDENT, students); // Collection<Student>
```

By default, models carrying user tags are checked first so records aren't created twice. Pass `false` as the third argument to skip that check.

### Upload

```ts
import { readFile } from 'node:fs/promises';
import { UploadFile } from '@joshepstein/arbor-sdk-ts';

await api.upload('/rest-v2/documents/upload',
  new UploadFile('file', await readFile('report.pdf'), 'report.pdf', { 'Content-Type': 'application/pdf' }));
```

`contents` can be a string, `Blob`, `ArrayBuffer` or typed array. `FormData` can only carry a part's `Content-Type`, so any other per-part headers are ignored.

### Timetables

```ts
const week = { from: new Date('2026-11-02'), to: new Date('2026-11-07') }; // `to` is exclusive

const lessons = await api.getStudentTimetable(4987, week); // a Student, an id, or a resource URL
const staffLessons = await api.getStaffTimetable(staff, week);

for (const l of lessons) {
  console.log(l.start, l.end, l.className, l.roomName, l.isSuspended);
  // also: l.session, l.academicUnit, l.room, l.timetableSlot (typed models)
}
```

- **Students:** current class enrolments (`AcademicUnitEnrolment`), then each class's sessions in the range.
- **Staff:** current timetable-slot assignments (`TimetableSlotStaff`), then each slot's sessions.
- **Permissions:** read access to `Session`, `AcademicUnit`, `Room`, and `AcademicUnitEnrolment` or `TimetableSlotStaff`.
- **Missing room:** `roomName` is `null` when a lesson has no room, or when the app can't read `Room`.
- **Cover:** cover and other one-off staff changes aren't included, because they aren't linked to the teacher's slots.
- **Speed:** on a live school, one week takes about 10s for a student and 15s for a teacher, because Arbor needs one request per class or slot and per lesson. For a whole school, sync to your own database rather than calling this live. See `examples/timetable.ts`.

### Student lookups

```ts
(await api.getYearGroup(4987))?.getAcademicLevelName();          // "Year 12"
(await api.getCurrentForm(4987))?.getRegistrationFormName();     // "12BV"

await api.getEmails(4987);                     // ['…@school.org']: a Student or Guardian (model, id or URL)

const c = await api.getContactDetails(4987);   // all parts; or { include: ['emails'] } to fetch only some
c.emails;      // [{ address, type, model }]
c.phones;      // [{ number, extension, type, model }]
c.addresses;   // current only: [{ lines, postcode, type, isCorrespondenceAddress, model }]
c.unavailable; // parts the app can't read, e.g. [{ part: 'phones', reason: 'Forbidden: …' }]

const guardians = await api.getGuardians(4987, { contacts: ['emails'] }); // primary first; `true` for all parts
guardians[0].name;           // from the guardian's Person, or null if the app can't read Person
guardians[0].relationship;   // "Mother"; also relationshipName and relationshipCode
guardians[0].contacts;       // ContactDetails, with { contacts: true }
```

Contact details belong to the Student or Guardian record, not to their Person. If the app can't read one part (say, phone numbers), that part comes back empty and is listed in `unavailable`. The other parts are still returned.

### Redacted and reference-only records

Arbor sends `{ entityType: 'Person' }` with nothing else for records the app isn't allowed to read, and for some records nested two levels deep. It sends just `{ href, id }` for records in lists.

```ts
person.isRedacted();  // true: no link or data. load() can't help
person.isReference(); // true: link only. Call load() for the rest
```

### Attendance and assessment services

```ts
import { AttendanceRegistration, AttendanceMark } from '@joshepstein/arbor-sdk-ts';

const svc = new AttendanceRegistration(api);
svc.awardAttendanceMark(student, sessionStart, await AttendanceMark.retrieve('LATE'), 16, 'Missed the bus');
await svc.saveMarks();
```

`AttendanceRollCallRegistration` and `StandardizedAssessmentMarks` are also available.

### Untyped access

Every model also has `getProperty(name)`, `setProperty(name, value)`, `getProperties()` and `toJSON()`. Resource types with no generated class hydrate as plain `ModelBase`. To use your own class for one, call `registerModel('Type', (g) => new MyModel({}, g))`.

## Examples

See [`examples/`](examples/). They're ports of the PHP examples.

```sh
cp .env.example .env        # fill in your sandbox URL and credentials
npm run sandbox:check       # read-only smoke test against the sandbox
npx tsx examples/student-retrieve.ts
```

## Development

```sh
npm install
npm test          # vitest (offline, mocked fetch)
npm run typecheck
npm run build     # dist/ (ESM + CJS + .d.ts)
```

### Regenerating models

`src/models/**` and `src/resource/resource-type.ts` are generated from a checkout of the PHP SDK:

```sh
git clone https://github.com/arbor-education/sis-sdk-php ../sis-sdk-php
npm run generate -- ../sis-sdk-php
```

Rerun this after pulling upstream changes. The script warns about anything it can't resolve. For example, nine upstream models point to `ResourceType` constants that don't exist (such as `Cymru_SchoolCensus`). For those, the generator falls back to the standard naming pattern.

## License

Apache-2.0. This is a derivative of `arbor-education/sis-sdk-php`; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
