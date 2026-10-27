import { AcademicHoliday, Query, ResourceType } from '../src/index.js';
import './bootstrap.js';

const query = new Query(ResourceType.ACADEMIC_HOLIDAY)
  .addPropertyFilter(AcademicHoliday.START_DATE, Query.OPERATOR_AFTER, '2016-04-06')
  .addPropertyFilter(AcademicHoliday.END_DATE, Query.OPERATOR_BEFORE, '2018-07-26')
  .setOrderProperty(AcademicHoliday.END_DATE);
const academicHolidays = await AcademicHoliday.query(query);

for (const academicHoliday of academicHolidays) {
  // Query results are references (href + displayName); load each one to read its fields.
  await academicHoliday.load();
  console.log(`
    academicHolidayType: ${academicHoliday.getAcademicHolidayType()}
    academicHolidayId: ${academicHoliday.getResourceId()}
    startDate: ${academicHoliday.getStartDate()?.toISOString()}
    endDate: ${academicHoliday.getEndDate()?.toISOString()}
  `);
}
