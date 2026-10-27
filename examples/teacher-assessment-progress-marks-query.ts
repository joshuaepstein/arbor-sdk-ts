import { Query, ResourceType, Student, StudentProgressAssessmentMark } from '../src/index.js';
import './bootstrap.js';

const student = await Student.retrieve(710);

const query = new Query(ResourceType.STUDENT_PROGRESS_ASSESSMENT_MARK).addPropertyFilter(
  StudentProgressAssessmentMark.STUDENT,
  Query.OPERATOR_EQUALS,
  student,
);
const progressMarks = await StudentProgressAssessmentMark.query(query);

for (const progressMark of progressMarks) {
  // Query results and related models are references; load what we read from.
  await progressMark.load();
  const markStudent = await progressMark.getStudent()?.load();
  const person = await markStudent?.getPerson()?.load();
  const assessment = await progressMark.getAssessment()?.load();
  const subject = await assessment?.getSubject()?.load();
  const grade = await progressMark.getGrade()?.load();

  // Grade has no getGradeCode() (the PHP original called one); getCode() is the grade's code.
  console.log(
    `Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()} -> ` +
      `Assessment: ${assessment?.getAssessmentName()} ${subject?.getSubjectName() ?? ''} -> ` +
      `Grade: ${grade?.getCode() ?? ''} -> Date: ${progressMark.getAssessmentDate()?.toISOString()}`,
  );
}
