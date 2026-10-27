import { AttendanceMark, AttendanceRegistration, Student } from '../src/index.js';
import { api } from './bootstrap.js';

const attendanceService = new AttendanceRegistration(api);

// Session start time: today at 9AM (dates are sent in the process's local time zone).
const sessionStartTime = new Date();
sessionStartTime.setHours(9, 0, 0, 0);

// Get some students which we are going to mark
const [student12, student13, student14] = await Promise.all([Student.retrieve(12), Student.retrieve(13), Student.retrieve(14)]);

// Get some valid attendance marks
const attMarkPresent = await AttendanceMark.retrieve('PRESENT');
const attMarkLate = await AttendanceMark.retrieve('LATE');

// Assign marks to students
attendanceService.awardAttendanceMark(student12, sessionStartTime, attMarkPresent);
attendanceService.awardAttendanceMark(student13, sessionStartTime, attMarkPresent);
attendanceService.awardAttendanceMark(student14, sessionStartTime, attMarkLate, 16, 'Says he missed the bus');

// Write marks to the server
await attendanceService.saveMarks();
