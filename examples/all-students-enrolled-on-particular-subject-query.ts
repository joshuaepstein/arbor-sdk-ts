import { AcademicUnit, AcademicUnitEnrolment, Query, ResourceType } from '../src/index.js';
import './bootstrap.js';

const course = await AcademicUnit.retrieve(389); // MATHS__YEAR_7
const refDate = new Date('2013-12-01T00:00:00'); // 2013-2014

const query = new Query(ResourceType.ACADEMIC_UNIT_ENROLMENT)
  .addPropertyFilter(AcademicUnitEnrolment.START_DATE, Query.OPERATOR_BEFORE, refDate)
  .addPropertyFilter(AcademicUnitEnrolment.END_DATE, Query.OPERATOR_AFTER, refDate)
  .addPropertyFilter(AcademicUnitEnrolment.ACADEMIC_UNIT, Query.OPERATOR_EQUALS, course);

const currentAcademicUnitEnrolments = await AcademicUnitEnrolment.query(query);

for (const enrolment of currentAcademicUnitEnrolments) {
  // Query results and related models arrive as references (PHP loaded them lazily):
  // load the enrolment, then its student, then the student's person.
  await enrolment.load();
  const student = await enrolment.getStudent()?.load();
  const person = await student?.getPerson()?.load();
  console.log(`Academic Unit: ${course.getAcademicUnitName()} -> Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()}`);
}
