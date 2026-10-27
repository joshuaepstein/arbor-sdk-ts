# Examples

TypeScript ports of the PHP SDK's `examples/` scripts. Each one is a standalone ESM script using top-level `await`.

## Running

Connection settings live in `.env` at the project root. `bootstrap.ts` loads it; it replaces the PHP `example-bootstrap.php` / `config.php`.

```sh
cp .env.example .env               # then fill in ARBOR_BASE_URL, ARBOR_USER, ARBOR_PASSWORD
npm run sandbox:check              # read-only smoke test; start here
npx tsx examples/student-retrieve.ts
```

`.env` is gitignored. Variables set in the shell override it. `ARBOR_DEBUG=1` logs every request.

`ARBOR_BASE_URL` may include or omit the trailing `/rest-v2`. `bootstrap.ts` also defaults `TZ` to `Europe/London`, as the PHP bootstrap did, because dates are sent to the API in local time.

Many examples use hard-coded IDs (students 1, 137, 710...) from Arbor's demo data, and several create or change records. Point them at a sandbox, not a live school.

## How the TS SDK differs from PHP

- **Everything that hits the network is async.** `api.retrieve()`, `api.query()`, `Student.retrieve()`, `Student.query()` and `model.save()` all return promises.
- **No `connect($api)`.** `createClient()` sets the default gateway, and new models pick it up automatically.
- **Getters only return data that has already been loaded.** The PHP SDK lazy-loaded inside getters. Query results and related models (for example `student.getPerson()`) arrive as references, so call `await model.load()` before reading their fields.
- **`print_r($hydrator->extractArray($model))` becomes `dump(model)`.** It prints `model.toJSON()`.
- **`serialize()` / `unserialize()` become `JSON.stringify(model)` / `ModelBase.fromJSON(...)`.**
- **Module models are namespaces.** For example `new UkDfe.EarlyYearsPupilPremiumRecipient()` with `UkDfeResourceType.UK_DFE_...`.
