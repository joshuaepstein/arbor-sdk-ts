import type { RestGateway } from '../api/gateway.js';
import { ArborError } from '../errors.js';
import type { ModelBase } from '../model/model-base.js';
import type { AcademicUnit } from '../models/AcademicUnit.js';
import { AcademicUnitEnrolment } from '../models/AcademicUnitEnrolment.js';
import type { Room } from '../models/Room.js';
import { Session } from '../models/Session.js';
import type { TimetableSlot } from '../models/TimetableSlot.js';
import { TimetableSlotStaff } from '../models/TimetableSlotStaff.js';
import { Query } from '../query/query.js';

/** One timetabled lesson. */
export interface Lesson {
  start: Date;
  end: Date;
  /** The class, e.g. "12A/Ma1". */
  className: string | null;
  /** The room, e.g. "M314". `null` if the session has no room, or the app can't read Room. */
  roomName: string | null;
  /** True when the lesson has been suspended (e.g. cancelled for an event). */
  isSuspended: boolean;
  session: Session;
  academicUnit: AcademicUnit | null;
  room: Room | null;
  timetableSlot: TimetableSlot | null;
}

export interface TimetableRange {
  /** Start of the range (inclusive). */
  from: Date;
  /** End of the range (exclusive). */
  to: Date;
}

type Owner = ModelBase | string | number;

/**
 * Builds timetables from Arbor's sessions.
 *
 * - Student: their current class enrolments, then each class's sessions in the range.
 * - Staff: their current timetable-slot assignments, then each slot's sessions in the range.
 *
 * Needs read access to Session, AcademicUnitEnrolment (student),
 * TimetableSlotStaff (staff), AcademicUnit and Room. Cover and other one-off
 * staff changes aren't included: the API doesn't link them to the staff
 * member's timetable slots.
 */
export class TimetableService {
  constructor(private readonly api: RestGateway) {}

  async forStudent(student: Owner, range: TimetableRange): Promise<Lesson[]> {
    const href = this.href(student, 'Student');
    const enrolments = await this.api.query<AcademicUnitEnrolment>(
      new Query(AcademicUnitEnrolment.RESOURCE_TYPE).addPropertyFilter(AcademicUnitEnrolment.STUDENT, Query.OPERATOR_EQUALS, href),
      { current: { at: range.from }, load: true },
    );
    const units = new Map<string, AcademicUnit>();
    for (const e of enrolments) {
      if (e.getStartDate() && e.getStartDate()! >= range.to) continue; // starts after the range
      const unit = e.getAcademicUnit();
      const url = unit?.getResourceUrl();
      if (unit && url) units.set(url, unit);
    }
    // Parent groups such as "Year 12" or "Mathematics" have no sessions; their queries just come back empty.
    return this.sessionsFor([...units.keys()].map((u) => ['academicUnit', u] as const), range);
  }

  async forStaff(staff: Owner, range: TimetableRange): Promise<Lesson[]> {
    const href = this.href(staff, 'Staff');
    const assignments = await this.api.query<TimetableSlotStaff>(
      new Query(TimetableSlotStaff.RESOURCE_TYPE).addPropertyFilter(TimetableSlotStaff.STAFF, Query.OPERATOR_EQUALS, href),
      { current: { at: range.from }, load: true },
    );
    const slots = new Set<string>();
    for (const a of assignments) {
      if (a.getEffectiveDate() && a.getEffectiveDate()! >= range.to) continue; // starts after the range
      const url = a.getTimetableSlot()?.getResourceUrl();
      if (url) slots.add(url);
    }
    return this.sessionsFor([...slots].map((s) => ['timetableSlot', s] as const), range);
  }

  private async sessionsFor(filters: (readonly [string, string])[], range: TimetableRange): Promise<Lesson[]> {
    if (range.to <= range.from) throw new ArborError('Timetable range: `to` must be after `from`');
    // `after` is exclusive, so start one second earlier to include lessons starting exactly at `from`.
    const after = new Date(range.from.getTime() - 1000);
    const lists = await Promise.all(
      filters.map(([property, value]) =>
        this.api.query<Session>(
          new Query(Session.RESOURCE_TYPE)
            .addPropertyFilter(property, Query.OPERATOR_EQUALS, value)
            .addPropertyFilter(Session.START_DATETIME, Query.OPERATOR_AFTER, after)
            .addPropertyFilter(Session.START_DATETIME, Query.OPERATOR_BEFORE, range.to),
        ),
      ),
    );

    // The same session can be reached through more than one class or slot.
    const unique = new Map<string, Session>();
    for (const s of lists.flat()) {
      const url = s.getResourceUrl();
      if (url && !unique.has(url)) unique.set(url, s);
    }
    const sessions = await this.api.loadAll(unique.values());

    return sessions
      .map((session) => this.toLesson(session))
      .filter((l): l is Lesson => l !== null && l.start >= range.from && l.start < range.to)
      .sort((a, b) => a.start.getTime() - b.start.getTime() || (a.className ?? '').localeCompare(b.className ?? ''));
  }

  private toLesson(session: Session): Lesson | null {
    const start = session.getStartDatetime();
    const end = session.getEndDatetime();
    if (!start || !end) return null;
    const unit = session.getAcademicUnit();
    const location = session.getLocation();
    // Redacted links (no permission) arrive as `{ entityType }` only, with no href.
    const room = location && !location.isRedacted() && location.getResourceType() === 'Room' ? (location as Room) : null;
    return {
      start,
      end,
      className: unit?.getAcademicUnitName() ?? unit?.getShortName() ?? session.getSessionName(),
      roomName: room?.getRoomName() ?? room?.getShortName() ?? session.getLocationText(),
      isSuspended: session.getIsSuspended() === true,
      session,
      academicUnit: unit?.getResourceUrl() ? unit : null,
      room,
      timetableSlot: session.getTimetableSlot()?.getResourceUrl() ? session.getTimetableSlot() : null,
    };
  }

  private href(owner: Owner, type: 'Student' | 'Staff'): string {
    if (typeof owner === 'string' && owner.startsWith('/')) return owner;
    if (typeof owner === 'string' || typeof owner === 'number') {
      return `/rest-v2/${this.api.getResource(type)}/${owner}`;
    }
    const url = owner.getResourceUrl();
    if (!url) throw new ArborError(`The ${type} has no resource URL; save or retrieve it first`);
    if (owner.getResourceType() !== type) throw new ArborError(`Expected a ${type}, got ${owner.getResourceType()}`);
    return url;
  }
}
