import { describe, expect, it } from 'vitest';
import { HttpClient, RestGateway, Student } from '../src/index.js';

/** A tiny fake Arbor: routes by path + filters, records every request. */
function fakeArbor() {
  const ref = (type: string, href: string) => ({ entityType: type, href });
  const room = (id: number, name: string) => ({ entityType: 'Room', href: `/rest-v2/rooms/${id}`, roomName: name });
  const unit = (id: number, name: string) => ({ entityType: 'AcademicUnit', href: `/rest-v2/academic-units/${id}`, academicUnitName: name });
  const session = (id: number, unitId: number, unitName: string, start: string, end: string, extra: object = {}) => ({
    entityType: 'Session',
    href: `/rest-v2/sessions/${id}`,
    startDatetime: start,
    endDatetime: end,
    academicUnit: unit(unitId, unitName),
    location: room(1, 'M314'),
    timetableSlot: ref('TimetableSlot', `/rest-v2/timetable-slots/${unitId}`),
    isSuspended: false,
    ...extra,
  });

  const records: Record<string, object> = {
    '/rest-v2/academic-unit-enrolments/1': { academicUnitEnrolment: { entityType: 'AcademicUnitEnrolment', href: '/rest-v2/academic-unit-enrolments/1', academicUnit: unit(10, '12A/Ma1'), startDate: '2026-09-01 00:00:00', endDate: '2027-08-31 00:00:00' } },
    '/rest-v2/academic-unit-enrolments/2': { academicUnitEnrolment: { entityType: 'AcademicUnitEnrolment', href: '/rest-v2/academic-unit-enrolments/2', academicUnit: unit(20, 'Year 12'), startDate: '2026-09-01 00:00:00', endDate: null } },
    '/rest-v2/academic-unit-enrolments/3': { academicUnitEnrolment: { entityType: 'AcademicUnitEnrolment', href: '/rest-v2/academic-unit-enrolments/3', academicUnit: unit(30, '12B/Ec1'), startDate: '2027-01-05 00:00:00', endDate: null } },
    '/rest-v2/sessions/100': { session: session(100, 10, '12A/Ma1', '2026-11-02 11:25:00', '2026-11-02 12:30:00') },
    '/rest-v2/sessions/101': { session: session(101, 10, '12A/Ma1', '2026-11-02 08:30:00', '2026-11-02 09:35:00', { location: { entityType: 'Room' }, locationText: null, isSuspended: true }) },
    '/rest-v2/timetable-slot-staffs/7': { timetableSlotStaff: { entityType: 'TimetableSlotStaff', href: '/rest-v2/timetable-slot-staffs/7', timetableSlot: ref('TimetableSlot', '/rest-v2/timetable-slots/10'), effectiveDate: '2026-09-01 00:00:00', endDate: null } },
  };

  const urls: string[] = [];
  const fetch = async (url: string) => {
    urls.push(decodeURIComponent(url));
    const u = new URL(url);
    const p = u.pathname;
    const q = Object.fromEntries(u.searchParams);
    const list = (key: string, items: object[]) => new Response(JSON.stringify({ [key]: items }), { status: 200 });
    if (records[p]) return new Response(JSON.stringify(records[p]), { status: 200 });
    if (p === '/rest-v2/AcademicUnitEnrolments') {
      // "ends after" returns the dated one; "no end date" returns the ongoing ones
      if (q['filters.endDate.after']) return list('academicUnitEnrolments', [ref('AcademicUnitEnrolment', '/rest-v2/academic-unit-enrolments/1')]);
      return list('academicUnitEnrolments', [ref('AcademicUnitEnrolment', '/rest-v2/academic-unit-enrolments/2'), ref('AcademicUnitEnrolment', '/rest-v2/academic-unit-enrolments/3')]);
    }
    if (p === '/rest-v2/TimetableSlotStaffs') {
      return list('timetableSlotStaffs', q['filters.endDate.equals'] === 'NULL' ? [ref('TimetableSlotStaff', '/rest-v2/timetable-slot-staffs/7')] : []);
    }
    if (p === '/rest-v2/Sessions') {
      const owner = q['filters.academicUnit.equals'] ?? q['filters.timetableSlot.equals'];
      if (owner?.endsWith('/10')) return list('sessions', [ref('Session', '/rest-v2/sessions/100'), ref('Session', '/rest-v2/sessions/101')]);
      return list('sessions', []);
    }
    return new Response('{}', { status: 404 });
  };

  const api = new RestGateway(new HttpClient({ baseUrl: 'https://x.test', fetch, maxRequestsPerSecond: Infinity }));
  return { api, urls };
}

const week = { from: new Date(2026, 10, 2), to: new Date(2026, 10, 7) };

describe('timetables', () => {
  it('builds a student timetable from current enrolments', async () => {
    const { api, urls } = fakeArbor();
    const lessons = await api.getStudentTimetable(4987, week);

    expect(lessons.map((l) => [l.start.toTimeString().slice(0, 5), l.className, l.roomName, l.isSuspended])).toEqual([
      ['08:30', '12A/Ma1', null, true], // redacted room → null, not a broken object
      ['11:25', '12A/Ma1', 'M314', false],
    ]);
    expect(lessons[1]!.room?.getRoomName()).toBe('M314');
    expect(lessons[0]!.room).toBeNull();

    // current enrolments were requested both ways, from the start of the range
    expect(urls).toContainEqual(expect.stringContaining('/rest-v2/AcademicUnitEnrolments?filters.student.equals=/rest-v2/students/4987&filters.endDate.after=2026-11-02 00:00:00'));
    expect(urls).toContainEqual(expect.stringContaining('filters.endDate.equals=NULL'));
    // the parent group was queried; the enrolment starting after the range was skipped
    expect(urls).toContainEqual(expect.stringContaining('filters.academicUnit.equals=/rest-v2/academic-units/20'));
    expect(urls.some((u) => u.includes('academic-units/30'))).toBe(false);
    // sessions are filtered with after/before (from/to silently fail on Arbor)
    expect(urls).toContainEqual(expect.stringContaining('filters.startDatetime.after=2026-11-01 23:59:59&filters.startDatetime.before=2026-11-07 00:00:00'));
  });

  it('builds a staff timetable from current slot assignments', async () => {
    const { api, urls } = fakeArbor();
    const lessons = await api.getStaffTimetable('/rest-v2/staffs/1159', week);
    expect(lessons.map((l) => l.className)).toEqual(['12A/Ma1', '12A/Ma1']);
    expect(urls).toContainEqual(expect.stringContaining('/rest-v2/Sessions?filters.timetableSlot.equals=/rest-v2/timetable-slots/10'));
  });

  it('accepts a model, and rejects the wrong kind or an unsaved one', async () => {
    const { api } = fakeArbor();
    const s = new Student({}, api);
    await expect(api.getStudentTimetable(s, week)).rejects.toThrow('no resource URL');
    s.setResourceUrl('/rest-v2/students/4987');
    expect(await api.getStudentTimetable(s, week)).toHaveLength(2);
    await expect(api.getStaffTimetable(s, week)).rejects.toThrow('Expected a Staff, got Student');
    await expect(api.getStudentTimetable(4987, { from: week.to, to: week.from })).rejects.toThrow('`to` must be after `from`');
  });
});
