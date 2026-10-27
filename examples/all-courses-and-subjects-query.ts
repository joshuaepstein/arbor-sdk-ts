import { AcademicUnit, Query, ResourceType, type AcademicYear } from '../src/index.js';
import { api } from './bootstrap.js';

const currentAcademicYear = await api.retrieve<AcademicYear>(ResourceType.ACADEMIC_YEAR, '2016-2017');
const academicUnitQuery = new Query(ResourceType.ACADEMIC_UNIT).addPropertyFilter(
  AcademicUnit.ACADEMIC_YEAR,
  Query.OPERATOR_EQUALS,
  currentAcademicYear,
);

for (const model of await api.query(academicUnitQuery)) {
  // Listings only return references, so fetch each academic unit in full.
  const academicUnit = await api.retrieve<AcademicUnit>(ResourceType.ACADEMIC_UNIT, model.getResourceId()!);
  // The subject is itself a reference; load it before reading its name.
  const subject = await academicUnit.getSubject()?.load();

  console.log(`Academic Unit: ${academicUnit.getAcademicUnitName()} -> Subject: ${subject?.getSubjectName() ?? 'None'}`);
}
