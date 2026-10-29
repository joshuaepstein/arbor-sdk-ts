/**
 * Prints a student's or staff member's timetable for a week. Read-only.
 *
 *   npx tsx examples/timetable.ts student 4987
 *   npx tsx examples/timetable.ts staff 123 2026-11-02
 *
 * The optional date is any day in the week to show (default: today). Needs
 * read access to Session, AcademicUnit, Room, and AcademicUnitEnrolment
 * (students) or TimetableSlotStaff (staff).
 */
import type { Lesson } from '../src/index.js';
import { api } from './bootstrap.js';

const [kind, id, day] = process.argv.slice(2);
if ((kind !== 'student' && kind !== 'staff') || !id) {
  console.error('Usage: npx tsx examples/timetable.ts <student|staff> <id> [YYYY-MM-DD]');
  process.exit(1);
}

// Monday 00:00 to Saturday 00:00 of the chosen week, local time.
const base = day ? new Date(`${day}T00:00:00`) : new Date();
const from = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 5);

const started = Date.now();
const range = { from, to };
const lessons: Lesson[] =
  kind === 'student' ? await api.getStudentTimetable(id, range) : await api.getStaffTimetable(id, range);

const time = (d: Date) => d.toTimeString().slice(0, 5);
let current = '';
for (const l of lessons) {
  const date = l.start.toDateString();
  if (date !== current) {
    console.log(`\n${date}`);
    current = date;
  }
  const suspended = l.isSuspended ? '  (suspended)' : '';
  console.log(`  ${time(l.start)}–${time(l.end)}  ${(l.className ?? '?').padEnd(14)} ${l.roomName ?? '-'}${suspended}`);
}
console.log(`\n${lessons.length} lessons, ${from.toDateString()} – ${new Date(to.getTime() - 1).toDateString()} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
