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
  ServerError,
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

  it('returns payloads for 200/201/204/422', async () => {
    const { fetch } = mockFetch({ status: 204 }, { status: 422, json: { response: { code: 422 } } });
    const http = new HttpClient({ baseUrl: 'https://x.test', fetch });
    expect(await http.sendRequest('DELETE', '/rest-v2/a/1')).toEqual({});
    expect(await http.sendRequest('GET', '/rest-v2/a')).toEqual({ response: { code: 422 } });
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
