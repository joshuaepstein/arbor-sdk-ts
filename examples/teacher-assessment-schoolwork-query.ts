import { Query, ResourceType, Student, StudentSchoolwork, StudentSchoolworkMark } from '../src/index.js';
import './bootstrap.js';

const student = await Student.retrieve(710);
const person = await student.getPerson()?.load();

const schoolworkQuery = new Query(ResourceType.STUDENT_SCHOOLWORK).addPropertyFilter(
  StudentSchoolwork.STUDENT,
  Query.OPERATOR_EQUALS,
  student,
);
const schoolWorks = await StudentSchoolwork.query(schoolworkQuery);

for (const schoolWork of schoolWorks) {
  await schoolWork.load(); // query results are references

  const schoolworkMarkQuery = new Query(ResourceType.STUDENT_SCHOOLWORK_MARK).addPropertyFilter(
    StudentSchoolworkMark.STUDENT_SCHOOLWORK,
    Query.OPERATOR_EQUALS,
    schoolWork,
  );
  const schoolworkMarks = await StudentSchoolworkMark.query(schoolworkMarkQuery);

  for (const schoolworkMark of schoolworkMarks) {
    await schoolworkMark.load();
    const grade = await schoolworkMark.getMarkGrade()?.load();
    // Grade has no getGradeCode() (the PHP original called one); getCode() is the grade's code.
    console.log(
      `Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()} -> ` +
        `Grade: ${grade?.getCode() ?? ''} -> Date: ${schoolWork.getSubmittedDatetime()?.toISOString()}`,
    );
  }
}
