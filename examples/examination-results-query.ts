import { QualificationResult, Query, ResourceType, Student } from '../src/index.js';
import './bootstrap.js';

const student = await Student.retrieve(278);
const person = await student.getPerson()?.load();

const query = new Query(ResourceType.QUALIFICATION_RESULT).addPropertyFilter(
  QualificationResult.STUDENT,
  Query.OPERATOR_EQUALS,
  student,
);
const qualificationResults = await QualificationResult.query(query);

for (const qualificationResult of qualificationResults) {
  await qualificationResult.load(); // query results are references
  const grade = await qualificationResult.getQualificationGrade()?.load();
  console.log(
    `Student: ${person?.getLegalFirstName()} ${person?.getLegalLastName()} -> Result: ${grade ? grade.getShortName() : qualificationResult.getNumericValue()}`,
  );
}
