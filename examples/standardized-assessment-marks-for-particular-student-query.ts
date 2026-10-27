import { Assessment, Query, ResourceType, Student, StudentStandardizedAssessmentMark } from '../src/index.js';
import './bootstrap.js';

const student = await Student.retrieve(710);
const person = await student.getPerson()?.load();

const assessmentQuery = new Query(ResourceType.ASSESSMENT).addPropertyFilter(
  Assessment.CODE,
  Query.OPERATOR_EQUALS,
  'UK_DFE__KS2__SCI__SUB__TA__NL',
);
const assessments = await Assessment.query(assessmentQuery);

for (const assessment of assessments) {
  await assessment.load(); // query results are references

  // StudentStandardizedAssessmentMark.query() sets the resource type itself.
  // The PHP original didn't filter by student; this adds the filter the script's name implies.
  const markQuery = new Query()
    .addPropertyFilter(StudentStandardizedAssessmentMark.STANDARDIZED_ASSESSMENT, Query.OPERATOR_EQUALS, assessment)
    .addPropertyFilter(StudentStandardizedAssessmentMark.STUDENT, Query.OPERATOR_EQUALS, student);
  const marks = await StudentStandardizedAssessmentMark.query(markQuery);

  for (const mark of marks) {
    await mark.load();
    const grade = await mark.getMarkGrade()?.load();
    if (!grade) continue;

    // Grade has no getGradeCode() (the PHP original called one); getCode() is the grade's code.
    console.log(
      `Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()} got ${grade.getCode()} ` +
        `for ${assessment.getAssessmentName()} on ${mark.getAssessmentDate()?.toISOString()}`,
    );
  }
}
