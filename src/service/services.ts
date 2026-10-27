import type { RestGateway } from '../api/gateway.js';
import { HttpMethod } from '../api/http-client.js';
import { ArborError } from '../errors.js';
import { Hydrator } from '../model/hydrator.js';
import { ModelBase } from '../model/model-base.js';
import { formatArborDate } from '../util/date.js';

abstract class MarkService<Mark> {
  protected readonly gateway: RestGateway;
  protected readonly hydrator = new Hydrator();
  protected marks: Mark[] = [];

  constructor(gateway?: RestGateway | null) {
    const g = gateway ?? (ModelBase.getDefaultGateway() as RestGateway | null);
    if (!g || typeof (g as RestGateway).getHttpClient !== 'function') {
      throw new ArborError('Pass a RestGateway or call ModelBase.setDefaultGateway() first');
    }
    this.gateway = g;
  }

  getGateway(): RestGateway {
    return this.gateway;
  }

  /** Marks queued but not yet saved. */
  getPendingMarks(): readonly Mark[] {
    return this.marks;
  }

  protected ref(model: ModelBase) {
    return this.hydrator.extractArray(model, true);
  }

  protected requireDate(value: unknown, label: string): string {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError(`${label} must be a valid Date`);
    }
    return formatArborDate(value);
  }

  protected async post(path: string, marks: unknown[]): Promise<void> {
    await this.gateway.getHttpClient().sendRequest(HttpMethod.POST, path, { body: { request: { marks } } });
    this.marks = [];
  }
}

export interface AttendanceMarkEntry {
  student: ModelBase;
  sessionStartTime: Date;
  attendanceMark: ModelBase;
  minutesLate?: number | null;
  note?: string | null;
  academicUnit?: ModelBase | null;
}

/** Writes session attendance marks in bulk (PHP: `Arbor\Service\AttendanceRegistration`). */
export class AttendanceRegistration extends MarkService<AttendanceMarkEntry> {
  static readonly MARK_STUDENT = 'student';
  static readonly MARK_MARK = 'attendanceMark';
  static readonly MARK_NOTE = 'note';
  static readonly MARK_MINUTES_LATE = 'minutesLate';
  static readonly MARK_SESSION_START_TIME = 'sessionStartTime';
  static readonly ACADEMIC_UNIT = 'academicUnit';
  static readonly INCLUDE_ACADEMIC_UNIT = 'includeAcademicUnit';
  static readonly INCLUDE_EXTRA_MARKS = 'includeExtraMarks';

  awardAttendanceMark(
    student: ModelBase,
    sessionStartTime: Date,
    attendanceMark: ModelBase,
    minutesLate: number | null = null,
    note: string | null = null,
    academicUnit: ModelBase | null = null,
  ): this {
    this.marks.push({ student, sessionStartTime, attendanceMark, minutesLate, note, academicUnit });
    return this;
  }

  async saveMarks(includeAcademicUnit = false, includeExtraMarks = false): Promise<void> {
    const payload = this.marks.map((mark) => {
      const out: Record<string, unknown> = {
        student: this.ref(mark.student),
        attendanceMark: this.ref(mark.attendanceMark),
        academicUnit: includeAcademicUnit && mark.academicUnit ? this.ref(mark.academicUnit) : null,
        includeAcademicUnit,
        sessionStartTime: this.requireDate(mark.sessionStartTime, 'sessionStartTime'),
      };
      if (mark.minutesLate != null) out.minutesLate = mark.minutesLate;
      if (mark.note != null) out.note = mark.note;
      if (includeExtraMarks) out.includeExtraMarks = true;
      return out;
    });
    await this.post('/rest-v2/attendance-registration', payload);
  }
}

export interface RollCallMarkEntry {
  student: ModelBase;
  attendanceMark: ModelBase;
  minutesLate?: number | null;
  rollCallDateTime?: Date;
  recordDate?: string | null;
  rollCall?: unknown;
}

/** Writes roll-call attendance marks in bulk (PHP: `Arbor\Service\AttendanceRollCallRegistration`). */
export class AttendanceRollCallRegistration extends MarkService<RollCallMarkEntry> {
  static readonly MARK_STUDENT = 'student';
  static readonly MARK_MARK = 'attendanceMark';
  static readonly MARK_ROLL_CALL_DATE_TIME = 'rollCallDateTime';
  static readonly MARK_MINUTES_LATE = 'minutesLate';
  static readonly MARK_RECORD_DATE = 'recordDate';
  static readonly MARK_ROLL_CALL = 'rollCall';

  awardAttendanceMark(student: ModelBase, rollCallDateTime: Date, attendanceMark: ModelBase, minutesLate: number | null = null): this {
    this.marks.push({ student, rollCallDateTime, attendanceMark, minutesLate });
    return this;
  }

  /**
   * @param recordDate passed through as-is (e.g. `'2024-09-01'`), as in the PHP SDK
   * @param rollCall passed through as-is, as in the PHP SDK
   */
  awardAttendanceMarkWithRecordDate(
    student: ModelBase,
    recordDate: string,
    rollCall: unknown,
    attendanceMark: ModelBase,
    minutesLate: number | null = null,
  ): this {
    this.marks.push({ student, recordDate, rollCall, attendanceMark, minutesLate });
    return this;
  }

  async saveMarks(): Promise<void> {
    const payload = this.marks.map((mark) => {
      const out: Record<string, unknown> = {
        student: this.ref(mark.student),
        attendanceMark: this.ref(mark.attendanceMark),
        minutesLate: mark.minutesLate ?? null,
        recordDate: mark.recordDate ?? null,
        rollCall: mark.rollCall ?? null,
      };
      if (mark.rollCallDateTime !== undefined) {
        out.rollCallDateTime = this.requireDate(mark.rollCallDateTime, 'rollCallDateTime');
      }
      return out;
    });
    await this.post('/rest-v2/attendance-roll-call-registration', payload);
  }
}

export interface StandardizedAssessmentMarkEntry {
  student: ModelBase;
  resultDate: Date;
  assessmentCode: string;
  result: unknown;
}

/** Writes standardized assessment results in bulk (PHP: `Arbor\Service\StandardizedAssessmentMarks`). */
export class StandardizedAssessmentMarks extends MarkService<StandardizedAssessmentMarkEntry> {
  static readonly MARK_STUDENT = 'student';
  static readonly MARK_ASSESSMENT_CODE = 'assessmentCode';
  static readonly MARK_RESULT_DATE = 'resultDate';
  static readonly MARK_RESULT = 'result';

  setMark(student: ModelBase, resultDate: Date, assessmentCode: string, result: unknown = null): this {
    this.marks.push({ student, resultDate, assessmentCode, result });
    return this;
  }

  async saveMarks(): Promise<void> {
    const payload = this.marks.map((mark) => ({
      student: this.ref(mark.student),
      result: mark.result,
      assessmentCode: mark.assessmentCode,
      resultDate: this.requireDate(mark.resultDate, 'resultDate'),
    }));
    await this.post('/rest-v2/standardized-assessment-mark', payload);
  }
}
