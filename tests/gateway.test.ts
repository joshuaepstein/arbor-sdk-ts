import { afterEach, describe, expect, it } from 'vitest';
import {
  AttendanceMark,
  AttendanceRegistration,
  Change,
  Collection,
  HttpClient,
  ModelBase,
  ModelError,
  Person,
  Query,
  QueryError,
  ResourceNotFoundError,
  ResourceType,
  Room,
  ServerError,
  ServerValidationError,
  Staff,
  Student,
  UploadFile,
  createClient,
  RestGateway,
} from '../src/index.js';
import { mockFetch, setup } from './helpers.js';

afterEach(() => ModelBase.setDefaultGateway(null));

describe('HttpClient', () => {
  it('sends auth, user agent, app id and JSON body', async () => {
    const { fetch, calls } = mockFetch({ json: { ok: true } });
    const http = new HttpClient({ baseUrl: 'https://x.test/rest-v2/', user: 'me', password: 'pässword', applicationId: 'app-1', fetch });
    await http.sendRequest('POST', '/rest-v2/things', { body: { a: 1 }, query: { q: 'v' } });

    const [call] = calls;
    expect(call!.url).toBe('https://x.test/rest-v2/things?q=v');
    expect(call!.headers.Authorization).toBe(`Basic ${Buffer.from('me:pässword').toString('base64')}`);
    expect(call!.headers['User-Agent']).toBe('Arbor TypeScript SDK');
    expect(call!.headers['x-mis-application-id']).toBe('app-1');
    expect(call!.headers['Content-Type']).toBe('application/json');
    expect(call!.body).toEqual({ a: 1 });
  });

  it('returns payloads for 200/201/204, and 422 on writes', async () => {
    const { fetch } = mockFetch({ status: 204 }, { status: 422, json: { response: { code: 422 } } });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    expect(await http.sendRequest('DELETE', '/rest-v2/a/1')).toEqual({});
    expect(await http.sendRequest('POST', '/rest-v2/a', { body: {} })).toEqual({ response: { code: 422 } });
  });

  it('throws on a 422 for reads so a bad filter is not mistaken for "no results"', async () => {
    const { fetch } = mockFetch({
      status: 422,
      json: { status: { success: false, code: 422, reason: 'Validation failed', errors: ['Supplied value is not valid'] } },
    });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    const err = (await http.sendRequest('GET', '/rest-v2/Sessions').catch((e) => e)) as ServerValidationError;
    expect(err).toBeInstanceOf(ServerValidationError);
    expect(err.message).toContain('Validation failed: Supplied value is not valid');
    expect(err.validationErrors).toEqual(['Supplied value is not valid']);
    expect(err.status).toBe(422);
  });

  it('maps 404 and server errors', async () => {
    const errors = { response: { code: 500, reason: 'Boom', errors: [{ exception: 'X\\Err', message: 'bad', trace: 't' }] } };
    const { fetch } = mockFetch({ status: 404, json: { response: { reason: 'Not here' } } }, { status: 500, json: errors }, { status: 502, text: '<html>' });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });

    await expect(http.sendRequest('GET', '/rest-v2/a/1')).rejects.toThrow(ResourceNotFoundError);

    const err = (await http.sendRequest('GET', '/rest-v2/a/1').catch((e) => e)) as ServerError;
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(500);
    expect(err.serverExceptionClass).toBe('X\\Err');
    expect(err.serverExceptionMessage).toBe('bad');
    expect(err.message).toContain('Server threw: X\\Err with message: bad');
    expect(err.responsePayload).toEqual(errors);

    await expect(http.sendRequest('GET', '/rest-v2/a/1')).rejects.toThrow('HTTP 502 and a non-JSON body: "<html>"');
  });

  it('explains 401s', async () => {
    const { fetch } = mockFetch({ status: 401, text: 'Authentication required.' });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    const err = (await http.sendRequest('GET', '/rest-v2/a').catch((e) => e)) as ServerError;
    expect(err.status).toBe(401);
    expect(err.message).toContain('Authentication failed');
    expect(err.message).toContain('Authentication required.');
  });

  it('reads { success, message } and { status: { errors } } error shapes', async () => {
    const { fetch } = mockFetch(
      { status: 401, json: { success: false, message: 'User is not allowed to access mvc:default/rest-v2/students' } },
      { status: 400, json: { status: { success: false, code: 400, reason: 'Validation failed', errors: ['Unknown properties supplied'] } } },
    );
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    const a = (await http.sendRequest('GET', '/rest-v2/a').catch((e) => e)) as ServerError;
    expect(a.status).toBe(401);
    expect(a.message).toBe('User is not allowed to access mvc:default/rest-v2/students');
    await expect(http.sendRequest('GET', '/rest-v2/a')).rejects.toThrow('Validation failed: Unknown properties supplied');
  });

  it('uses the API-reported code over the HTTP status', async () => {
    const { fetch } = mockFetch({ status: 200, json: { response: { code: 403, reason: 'Forbidden' } } });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    await expect(http.sendRequest('GET', '/rest-v2/a')).rejects.toThrow('Forbidden');
  });

  it('wraps network failures', async () => {
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch: async () => { throw new Error('ECONNRESET'); } });
    await expect(http.sendRequest('GET', '/rest-v2/a')).rejects.toThrow('An unexpected error has occurred: ECONNRESET');
  });

  it('uploads multipart form data', async () => {
    const { fetch, calls } = mockFetch({ json: { uploaded: true } });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    const res = await http.uploadRequest('/rest-v2/documents/upload', new UploadFile('file', 'hello', 'a.txt', { 'Content-Type': 'text/plain' }));
    expect(res).toEqual({ uploaded: true });
    const form = calls[0]!.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('file') as File;
    expect(file.name).toBe('a.txt');
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('hello');
    expect(calls[0]!.headers['Content-Type']).toBeUndefined();
  });
});

describe('rate limiting', () => {
  it('parses Retry-After seconds and dates', async () => {
    const { parseRetryAfter } = await import('../src/api/http-client.js');
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6_000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });

  it('retries 429 and 503, then succeeds', async () => {
    const { fetch, calls } = mockFetch(
      { status: 429, text: 'Too Many Requests' },
      { status: 503, text: 'busy' },
      { json: { ok: 1 } },
    );
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch, retryBaseDelayMs: 0 });
    expect(await http.sendRequest('GET', '/rest-v2/a')).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
  });

  it('honours Retry-After', async () => {
    let n = 0;
    const started = Date.now();
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      retryBaseDelayMs: 10_000, // would be slow if Retry-After were ignored
      fetch: async () =>
        n++ === 0
          ? new Response('slow down', { status: 429, headers: { 'Retry-After': '0.05' } })
          : new Response('{"ok":true}', { status: 200 }),
    });
    expect(await http.sendRequest('GET', '/rest-v2/a')).toEqual({ ok: true });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('gives up after maxRetries with a helpful message', async () => {
    const { fetch, calls } = mockFetch(...Array.from({ length: 3 }, () => ({ status: 429, text: 'Too Many Requests' })));
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch, maxRetries: 2, retryBaseDelayMs: 0 });
    const err = (await http.sendRequest('GET', '/rest-v2/a').catch((e) => e)) as ServerError;
    expect(calls).toHaveLength(3);
    expect(err.status).toBe(429);
    expect(err.message).toContain('Rate limited by Arbor');
  });

  it('pauses all requests while one is backing off', async () => {
    const starts: number[] = [];
    let first = true;
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      maxRequestsPerSecond: Infinity,
      retryBaseDelayMs: 100,
      fetch: async () => {
        starts.push(Date.now());
        if (first) {
          first = false;
          return new Response('Too Many Requests', { status: 429 });
        }
        return new Response('{}', { status: 200 });
      },
    });
    const t0 = Date.now();
    const a = http.sendRequest('GET', '/rest-v2/a');
    await new Promise((r) => setTimeout(r, 20)); // second request arrives during the backoff
    await Promise.all([a, http.sendRequest('GET', '/rest-v2/b')]);
    expect(starts).toHaveLength(3);
    expect(starts[1]! - t0).toBeGreaterThanOrEqual(90);
    expect(starts[2]! - t0).toBeGreaterThanOrEqual(90);
  });

  it('paces requests to maxRequestsPerSecond', async () => {
    const starts: number[] = [];
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      maxRequestsPerSecond: 20, // one every 50ms
      fetch: async () => {
        starts.push(Date.now());
        return new Response('{}', { status: 200 });
      },
    });
    await Promise.all(Array.from({ length: 5 }, () => http.sendRequest('GET', '/rest-v2/a')));
    expect(starts[4]! - starts[0]!).toBeGreaterThanOrEqual(190);
  });

  it('caps parallel requests', async () => {
    let inFlight = 0;
    let peak = 0;
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      maxConcurrentRequests: 3,
      maxRequestsPerSecond: Infinity,
      fetch: async () => {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return new Response('{}', { status: 200 });
      },
    });
    await Promise.all(Array.from({ length: 20 }, () => http.sendRequest('GET', '/rest-v2/a')));
    expect(peak).toBe(3);
  });

  it('applies the cap and retries to fetchRaw too', async () => {
    const { fetch, calls } = mockFetch({ status: 429, text: 'x' }, { status: 200, text: 'img' });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch, retryBaseDelayMs: 0 });
    const res = await http.fetchRaw('/rest-v2/profile-picture/student/1');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});

describe('RestGateway', () => {
  it('retrieves a typed model', async () => {
    const { api, calls } = setup({ json: { staff: { entityType: 'Staff', href: '/rest-v2/staff/5', id: 5 } } });
    const staff = await api.retrieve<Staff>(ResourceType.STAFF, 5);
    expect(calls[0]!.url).toBe('https://school.example/rest-v2/staffs/5');
    expect(staff).toBeInstanceOf(Staff);
    expect(staff.getResourceId()).toBe('5');
  });

  it('supports static Model.retrieve / Model.query via the default gateway', async () => {
    const { calls } = setup(
      { json: { student: { entityType: 'Student', href: '/rest-v2/students/16' } } },
      { json: { students: [{ entityType: 'Student', href: '/rest-v2/students/1' }, { entityType: 'Student', href: '/rest-v2/students/2' }] } },
    );
    expect(await Student.retrieve(16)).toBeInstanceOf(Student);

    const results = await Student.query(new Query().addPropertyFilter(Student.PERSON, 'equals', '/rest-v2/persons/1'));
    expect(results).toBeInstanceOf(Collection);
    expect(results.map((s) => s.getResourceId())).toEqual(['1', '2']);
    expect(calls[1]!.url).toBe('https://school.example/rest-v2/Students?filters.person.equals=%2Frest-v2%2Fpersons%2F1');
  });

  it('throws a helpful error with no default gateway', () => {
    expect(() => Student.retrieve(1)).toThrow(ModelError);
  });

  it('returns an empty collection when the root is missing', async () => {
    const { api } = setup({ json: {} });
    expect(await api.query(new Query('Student'))).toHaveLength(0);
  });

  it('creates a model and hydrates the response', async () => {
    const { calls } = setup({ json: { person: { entityType: 'Person', href: '/rest-v2/persons/9', legalFirstName: 'Ada' } } });
    const person = new Person();
    person.setLegalFirstName('Ada');
    person.setDateOfBirth(new Date(2000, 0, 1));
    await person.save();

    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://school.example/rest-v2/persons');
    expect(calls[0]!.body).toEqual({
      request: { person: { entityType: 'Person', legalFirstName: 'Ada', dateOfBirth: { entityType: 'date', date: '2000-01-01 00:00:00' } } },
    });
    expect(person.getResourceUrl()).toBe('/rest-v2/persons/9');
  });

  it('throws when create response lacks the resource root', async () => {
    const { api } = setup({ json: { something: 1 } });
    await expect(api.create(new Person())).rejects.toThrow(QueryError);
  });

  it('updates only changed properties, keeping entityType/href on nested resources', async () => {
    const server = {
      entityType: 'Student', href: '/rest-v2/students/1', uniqueLearnerNumber: '100', ethnicitySource: 'P',
      person: { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'Old', legalLastName: 'Same' },
    };
    const { api, calls } = setup(
      { json: { student: server } }, // initial retrieve
      { json: { student: server } }, // update() fetches the server copy
      { json: { student: { ...server, uniqueLearnerNumber: '200' } } },
    );
    const student = await api.retrieve<Student>('Student', 1);
    student.setUniqueLearnerNumber(100); // loosely equal to '100' → not sent
    student.setEthnicitySource('Q');
    student.getPerson()!.setLegalFirstName('New');
    await student.save();

    expect(calls[2]!.method).toBe('PUT');
    expect(calls[2]!.url).toBe('https://school.example/rest-v2/students/1');
    expect(calls[2]!.body).toEqual({
      request: {
        student: {
          ethnicitySource: 'Q',
          person: { legalFirstName: 'New', entityType: 'Person', href: '/rest-v2/persons/1' },
        },
      },
    });
  });

  it('skips the PUT when nothing changed', async () => {
    const rep = { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'A' };
    const { api, calls } = setup({ json: { person: rep } }, { json: { person: rep } });
    const p = await api.retrieve<Person>('Person', 1);
    await api.update(p);
    expect(calls).toHaveLength(2);
  });

  it('deletes', async () => {
    const { api, calls } = setup({ json: { response: { success: true } } });
    const p = new Person();
    p.setResourceUrl('/rest-v2/persons/3');
    expect(await api.delete(p)).toEqual({ response: { success: true } });
    expect(calls[0]!.method).toBe('DELETE');
  });

  it('lazy-loads a referenced model with load() / fetchProperty()', async () => {
    const { api } = setup(
      { json: { student: { entityType: 'Student', href: '/rest-v2/students/1', person: { entityType: 'Person', href: '/rest-v2/persons/4' } } } },
      { json: { person: { entityType: 'Person', href: '/rest-v2/persons/4', legalFirstName: 'Lazy' } } },
    );
    const student = await api.retrieve<Student>('Student', 1);
    const person = student.getPerson()!;
    expect(person.getLegalFirstName()).toBeNull();
    expect(await person.fetchProperty('legalFirstName')).toBe('Lazy');
  });

  it('reads the changelog', async () => {
    const { api, calls } = setup({
      json: { changes: [{ changeType: 'UPDATE', fromRevision: 1, toRevision: 2, changedObject: { entityType: 'Student', href: '/rest-v2/students/1' } }] },
    });
    const changes = await api.getChanges<Student>('Student', 1, 5);
    expect(calls[0]!.url).toBe('https://school.example/rest-v2/students/changelog?from-revision=1&to-revision=5');
    expect(changes[0]).toBeInstanceOf(Change);
    expect(changes[0]!.getChangedResource()).toBeInstanceOf(Student);
    expect(changes[0]!.getChangeType()).toBe('UPDATE');
  });

  it('returns [] when the changelog has no changes key', async () => {
    const { api } = setup({ json: {} });
    expect(await api.getChanges('Student')).toEqual([]);
  });

  it('bulk-creates and hydrates successful results', async () => {
    const { api, calls } = setup({
      json: {
        results: [
          { status: { success: true }, person: { entityType: 'Person', href: '/rest-v2/persons/1' } },
          { status: { success: false, errors: ['nope'] } },
        ],
      },
    });
    const a = new Person();
    const b = new Person();
    const created = await api.bulkCreate('Person', [a, b], false);
    expect(created).toHaveLength(2);
    expect(a.getResourceUrl()).toBe('/rest-v2/persons/1');
    expect(b.getResourceUrl()).toBeNull();
    expect(calls[0]!.body).toEqual({ request: [{ person: { entityType: 'Person' } }, { person: { entityType: 'Person' } }] });
  });

  it('bulk-create checks user tags for existing records', async () => {
    const { api, calls } = setup({ json: { persons: [{ entityType: 'Person', href: '/rest-v2/persons/77' }] } });
    const p = new Person();
    p.tag('externalId', 'E1');
    await expect(api.bulkCreate('Person', [p])).rejects.toThrow('/rest-v2/persons/77');
    expect(calls[0]!.url).toContain('filters.tags.externalId=E1');
  });

  it('bulk-create rejects mixed types and existing models', async () => {
    const { api } = setup();
    await expect(api.bulkCreate('Person', [new Student()])).rejects.toThrow('Not all elements');
    const p = new Person();
    p.setResourceUrl('/rest-v2/persons/1');
    await expect(api.bulkCreate('Person', [p])).rejects.toThrow('already exists');
  });

  it('bulk-create appends failed statuses to the error message', async () => {
    const { api } = setup({ status: 500, json: { response: { code: 500, reason: 'Bulk failed' }, results: [{ status: { success: false, errors: ['dup'] } }] } });
    const err = (await api.bulkCreate('Person', [new Person()], false).catch((e) => e)) as ServerError;
    expect(err).toBeInstanceOf(ServerError);
    expect(err.message).toBe('Bulk failed\n[{"success":false,"errors":["dup"]}]');
  });

  it('findAll / findOne', async () => {
    const { api, calls } = setup(
      { json: { students: [{ entityType: 'Student', href: '/rest-v2/students/1' }] } },
      { json: { students: [] } },
    );
    const all = await api.findAll('Student', { legalLastName: 'Adams', dateOfBirth: ['after', '2010-01-01'] });
    expect(all).toHaveLength(1);
    expect(calls[0]!.url).toContain('filters.legalLastName.equals=Adams&filters.dateOfBirth.after=2010-01-01');
    expect(await api.findOne('Student', { id: 9 })).toBeNull();
    expect(await api.findOne('Student', {})).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('sets the application id on the HTTP client', async () => {
    const { api, http, calls } = setup({ json: {} });
    api.setApplicationId('my-app');
    expect(http.getApplicationId()).toBe('my-app');
    await api.query(new Query('Student'));
    expect(calls[0]!.headers['x-mis-application-id']).toBe('my-app');
  });
});

describe('query options', () => {
  it('current: merges "ends after now" with "no end date", without duplicates', async () => {
    const { api, calls } = setup(
      { json: { timetableSlotStaffs: [{ entityType: 'TimetableSlotStaff', href: '/rest-v2/timetable-slot-staffs/1' }, { entityType: 'TimetableSlotStaff', href: '/rest-v2/timetable-slot-staffs/2' }] } },
      { json: { timetableSlotStaffs: [{ entityType: 'TimetableSlotStaff', href: '/rest-v2/timetable-slot-staffs/2' }, { entityType: 'TimetableSlotStaff', href: '/rest-v2/timetable-slot-staffs/3' }] } },
    );
    const q = new Query('TimetableSlotStaff').addPropertyFilter('staff', 'equals', '/rest-v2/staff/9');
    const res = await api.query(q, { current: { at: new Date(2026, 9, 29) } });
    expect(res.map((m) => m.getResourceId())).toEqual(['1', '2', '3']);
    expect(decodeURIComponent(calls[0]!.url)).toContain('filters.staff.equals=/rest-v2/staff/9&filters.endDate.after=2026-10-29 00:00:00');
    expect(decodeURIComponent(calls[1]!.url)).toContain('filters.endDate.equals=NULL');
    expect(q.getPropertyFilters()).toHaveLength(1); // the caller's query is untouched
  });

  it('current: supports a different end property', async () => {
    const { api, calls } = setup({ json: {} }, { json: {} });
    await api.query(new Query('X'), { current: { endProperty: 'endDatetime' } });
    expect(calls.map((c) => decodeURIComponent(c.url))).toEqual([
      expect.stringContaining('filters.endDatetime.after='),
      expect.stringContaining('filters.endDatetime.equals=NULL'),
    ]);
  });

  it('load: fills in each result', async () => {
    const { api, calls } = setup(
      { json: { rooms: [{ entityType: 'Room', href: '/rest-v2/rooms/1' }, { entityType: 'Room', href: '/rest-v2/rooms/2' }] } },
      (call) => ({ json: { room: { entityType: 'Room', href: new URL(call.url).pathname, roomName: `R${new URL(call.url).pathname.slice(-1)}` } } }),
      (call) => ({ json: { room: { entityType: 'Room', href: new URL(call.url).pathname, roomName: `R${new URL(call.url).pathname.slice(-1)}` } } }),
    );
    const rooms = await Room.query(new Query(), { load: true });
    expect(rooms.map((r) => r.getRoomName()).sort()).toEqual(['R1', 'R2']);
    expect(calls).toHaveLength(3);
  });

  it('clone() copies filters independently', () => {
    const a = new Query('Student').addPropertyFilter('x', 'equals', 1).setPageNumber(2);
    const b = a.clone().addPropertyFilter('y', 'equals', 2);
    expect(a.getPropertyFilters()).toHaveLength(1);
    expect(b.getPropertyFilters()).toHaveLength(2);
    expect(b.getQueryOptions()['page-number']).toBe(2);
  });
});

describe('record cache', () => {
  const room = { room: { entityType: 'Room', href: '/rest-v2/rooms/1', roomName: 'M314' } };

  function counting(reply: () => unknown, delayMs = 0) {
    let calls = 0;
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      maxRequestsPerSecond: Infinity,
      fetch: async () => {
        calls++;
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        return new Response(JSON.stringify(reply()), { status: 200 });
      },
    });
    return { http, count: () => calls };
  }

  it('merges identical requests that are in flight together, even with caching off', async () => {
    const { http, count } = counting(() => room, 10);
    const api = new RestGateway(http);
    const rooms = await Promise.all(Array.from({ length: 10 }, () => api.retrieve<Room>('Room', 1)));
    expect(count()).toBe(1);
    expect(rooms.every((r) => r.getRoomName() === 'M314')).toBe(true);
    expect(new Set(rooms).size).toBe(10); // separate model instances
    await api.retrieve('Room', 1);
    expect(count()).toBe(2); // not cached afterwards
  });

  it('reuses records within cacheTtlMs, and copies so callers cannot corrupt the cache', async () => {
    const { http, count } = counting(() => room);
    const api = new RestGateway(http, { cacheTtlMs: 60_000 });
    const a = await api.retrieve<Room>('Room', 1);
    a.setRoomName('changed locally');
    const b = await api.retrieve<Room>('Room', 1);
    const c = new Room({}, api);
    c.setResourceUrl('/rest-v2/rooms/1');
    await c.load();
    expect(count()).toBe(1);
    expect(b.getRoomName()).toBe('M314');
    expect(c.getRoomName()).toBe('M314');
  });

  it('expires entries and can be cleared', async () => {
    const { http, count } = counting(() => room);
    const api = new RestGateway(http, { cacheTtlMs: 20 });
    await api.retrieve('Room', 1);
    await new Promise((r) => setTimeout(r, 30));
    await api.retrieve('Room', 1);
    expect(count()).toBe(2);
    api.clearCache();
    await api.retrieve('Room', 1);
    expect(count()).toBe(3);
  });

  it('update() diffs against a fresh copy and clears the cached entry', async () => {
    const replies = [
      { person: { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'A' } }, // retrieve (cached)
      { person: { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'Server' } }, // update's fresh copy
      { person: { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'B' } }, // PUT response
      { person: { entityType: 'Person', href: '/rest-v2/persons/1', legalFirstName: 'B' } }, // retrieve after save
    ];
    const urls: string[] = [];
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      maxRequestsPerSecond: Infinity,
      fetch: async (url, init) => {
        urls.push(`${init.method} ${url}`);
        return new Response(JSON.stringify(replies.shift()), { status: 200 });
      },
    });
    const api = new RestGateway(http, { cacheTtlMs: 60_000 });
    const p = await api.retrieve<Person>('Person', 1);
    p.setLegalFirstName('B');
    await api.update(p);
    expect((await api.retrieve<Person>('Person', 1)).getLegalFirstName()).toBe('B');
    expect(urls).toEqual([
      'GET https://x.test/rest-v2/persons/1',
      'GET https://x.test/rest-v2/persons/1',
      'PUT https://x.test/rest-v2/persons/1',
      'GET https://x.test/rest-v2/persons/1',
    ]);
  });
});

describe('profile pictures', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

  it('downloads and detects a JPEG served as octet-stream', async () => {
    const calls: string[] = [];
    const http = new HttpClient({
      baseUrl: 'https://x.test',
      fetch: async (url) => {
        calls.push(url);
        return new Response(jpeg, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
      },
    });
    const api = new RestGateway(http);
    const s = new Student();
    s.setResourceUrl('/rest-v2/students/1');
    const pic = await api.getProfilePicture(s);
    expect(calls[0]).toBe('https://x.test/rest-v2/profile-picture/student/1');
    expect(pic?.contentType).toBe('image/jpeg');
    expect(pic?.extension).toBe('jpg');
    expect(pic?.data).toEqual(jpeg);
  });

  it('returns null when there is no picture, and throws on errors', async () => {
    const replies = [new Response(null, { status: 404 }), new Response('{"success":false}', { status: 200 }), new Response('nope', { status: 401 })];
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch: async () => replies.shift()! });
    const api = new RestGateway(http);
    expect(await api.getProfilePicture('staff', 1)).toBeNull();
    expect(await api.getProfilePicture('staff', 1)).toBeNull();
    await expect(api.getProfilePicture('staff', 1)).rejects.toThrow('HTTP 401: nope');
    await expect(api.getProfilePicture(new Person())).rejects.toThrow('only available for Student and Staff');
  });

  it('resolves a content tag target', async () => {
    const { api } = setup({ json: { contentTag: { entityType: 'ContentTag', tagged: { entityType: 'Student', id: 1 } } } });
    expect(await api.getContentTagTarget(3)).toEqual({ entityType: 'Student', id: 1 });
  });
});

describe('services', () => {
  it('posts attendance marks', async () => {
    const { api, calls } = setup({ json: {} });
    const student = new Student();
    student.setResourceUrl('/rest-v2/students/12');
    const mark = new AttendanceMark();
    mark.setResourceUrl('/rest-v2/attendance-marks/LATE');

    const svc = new AttendanceRegistration(api);
    svc.awardAttendanceMark(student, new Date(2024, 2, 4, 9), mark, 16, 'Missed the bus');
    await svc.saveMarks();

    expect(calls[0]!.url).toBe('https://school.example/rest-v2/attendance-registration');
    expect(calls[0]!.body).toEqual({
      request: {
        marks: [
          {
            student: { entityType: 'Student', href: '/rest-v2/students/12' },
            attendanceMark: { entityType: 'AttendanceMark', href: '/rest-v2/attendance-marks/LATE' },
            academicUnit: null,
            includeAcademicUnit: false,
            sessionStartTime: '2024-03-04 09:00:00',
            minutesLate: 16,
            note: 'Missed the bus',
          },
        ],
      },
    });
    expect(svc.getPendingMarks()).toHaveLength(0);
  });
});

describe('createClient', () => {
  it('builds a gateway and sets it as default', () => {
    const { fetch } = mockFetch();
    const api = createClient({ baseUrl: 'https://x.test', fetch });
    expect(ModelBase.getDefaultGateway()).toBe(api);
    expect(new Person().getApiGateway()).toBe(api);
  });
});
