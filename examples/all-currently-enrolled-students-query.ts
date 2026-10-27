import { AcademicYearEnrolment, Query, ResourceType } from '../src/index.js';
import './bootstrap.js';

const date = new Date();

const query = new Query(ResourceType.ACADEMIC_YEAR_ENROLMENT)
  .addPropertyFilter(AcademicYearEnrolment.START_DATE, Query.OPERATOR_BEFORE, date)
  .addPropertyFilter(AcademicYearEnrolment.END_DATE, Query.OPERATOR_AFTER, date);
const enrolments = await AcademicYearEnrolment.query(query);

for (const enrolment of enrolments) {
  // Query results and related models arrive as references (PHP loaded them lazily):
  // load the enrolment, then its student, then the student's person.
  await enrolment.load();
  const student = await enrolment.getStudent()?.load();
  const person = await student?.getPerson()?.load();
  console.log(`Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()}`);
}
