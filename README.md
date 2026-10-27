# Arbor TypeScript SDK

> **Unofficial.** This is a community port. Arbor Education doesn't make, maintain or support it. For the official SDK, see [sis-sdk-php](https://github.com/arbor-education/sis-sdk-php).

A TypeScript port of the [Arbor Education PHP SDK](https://github.com/arbor-education/sis-sdk-php) for the Arbor REST API (`/rest-v2`).

It has the same building blocks as the PHP SDK: a gateway for CRUD, queries, changelogs, bulk creation and uploads; a `Query` builder; and typed classes for all 910 Arbor resources (including the `UkDfe`, `UkIlr`, `UkJcq`, `Cymru` and `Cayman` modules).

- No runtime dependencies. It uses the built-in `fetch`, so it runs on Node 18+, Bun, Deno and edge runtimes.
- Ships ESM and CommonJS builds with full type definitions.
- Models are generated from the PHP SDK, so they stay in step with upstream (see [Regenerating models](#regenerating-models)).

## Install

```sh
npm install arbor-sdk-ts
```

Get API credentials for a sandbox from the [Arbor Developers Portal](https://developers-portal.arbor.sc).

## Quick start

```ts
import { createClient, Student, Person, Query, ResourceType } from 'arbor-sdk-ts';

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
import { HttpClient, RestGateway, ModelBase } from 'arbor-sdk-ts';

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

## Errors

```ts
import { ServerError, ResourceNotFoundError } from 'arbor-sdk-ts';

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
import { UploadFile } from 'arbor-sdk-ts';

await api.upload('/rest-v2/documents/upload',
  new UploadFile('file', await readFile('report.pdf'), 'report.pdf', { 'Content-Type': 'application/pdf' }));
```

`contents` can be a string, `Blob`, `ArrayBuffer` or typed array. `FormData` can only carry a part's `Content-Type`, so any other per-part headers are ignored.

### Attendance and assessment services

```ts
import { AttendanceRegistration, AttendanceMark } from 'arbor-sdk-ts';

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
