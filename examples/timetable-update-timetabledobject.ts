import { AcademicUnit, TimetableSlot } from '../src/index.js';
import './bootstrap.js';

// Point a timetable slot at a different academic unit.
const timetableSlot = await TimetableSlot.retrieve(1);
const academicUnit = await AcademicUnit.retrieve(1);
const oldAcademicUnit = timetableSlot.getTimetabledObject();
timetableSlot.setTimetabledObject(academicUnit);
await timetableSlot.save();

// Re-fetch and compare by resource URL (PHP compared the objects with ==).
const timetableSlotCopy = await TimetableSlot.retrieve(1);
if (timetableSlotCopy.getTimetabledObject()?.getResourceUrl() === academicUnit.getResourceUrl()) {
  console.log(`changed (was ${oldAcademicUnit?.getResourceUrl() ?? 'nothing'})`);
}
