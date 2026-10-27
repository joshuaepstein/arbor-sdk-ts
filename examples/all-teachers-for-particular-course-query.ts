import { AcademicUnit, AcademicUnitLead, Query, ResourceType } from '../src/index.js';
import './bootstrap.js';

const academicUnitsQuery = new Query(ResourceType.ACADEMIC_UNIT).addPropertyFilter(
  AcademicUnit.ACADEMIC_UNIT_NAME,
  Query.OPERATOR_EQUALS,
  '7TE-CI',
);
const academicUnits = await AcademicUnit.query(academicUnitsQuery);

for (const academicUnit of academicUnits) {
  const academicUnitLeadsQuery = new Query(ResourceType.ACADEMIC_UNIT_LEAD).addPropertyFilter(
    AcademicUnitLead.ACADEMIC_UNIT,
    Query.OPERATOR_EQUALS,
    academicUnit,
  );
  const academicUnitLeads = await AcademicUnitLead.query(academicUnitLeadsQuery);

  for (const lead of academicUnitLeads) {
    // Listings return references; load the lead, its staff member, and their person.
    await lead.load();
    const staff = await lead.getStaff()?.load();
    const person = await staff?.getPerson()?.load();
    console.log(
      `Academic Unit ${academicUnit.getAcademicUnitName()} -> Lead: ${person?.getLegalFirstName()} ${person?.getLegalLastName()}` +
        ` -> ${lead.getStartDate()?.toISOString()} - ${lead.getEndDate()?.toISOString()}`,
    );
  }
}
