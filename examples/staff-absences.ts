import {
  Person, ResourceType, Staff, type Ethnicity, type Gender, type Religion, type Title,
  StaffAbsence,
  type StaffAbsenceCategory,
  type StaffAbsenceSicknessCategory,
  type StaffAbsenceSicknessSubcategory,
} from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Create a staff member to record the absence against.
const person = new Person();
person.setDateOfBirth(new Date(2000, 0, 1));
person.setLegalFirstName('Simbad');
person.setLegalLastName('Sailor');
person.setGender(await api.retrieve<Gender>(ResourceType.GENDER, 'MALE'));
person.setTitle(await api.retrieve<Title>(ResourceType.TITLE, 'MR'));

const staff = new Staff();
staff.setPerson(person);
staff.setEthnicity(await api.retrieve<Ethnicity>(ResourceType.ETHNICITY, 'AAFR'));
staff.setReligion(await api.retrieve<Religion>(ResourceType.RELIGION, 'CHRISTIAN'));
staff.tag('custom-reference-id', 123); // can be string or number
await person.save(); // the person must exist before the staff record that points at it
await staff.save();

const daysLost = 7;

const staffAbsence = new StaffAbsence();
staffAbsence.setStaff(staff);
staffAbsence.setStartDatetime(new Date(2020, 3, 1, 9, 0, 0));
staffAbsence.setEndDatetime(new Date(2020, 3, 9, 9, 0, 0));
staffAbsence.setStaffAbsenceCategory(await api.retrieve<StaffAbsenceCategory>(ResourceType.STAFF_ABSENCE_CATEGORY, 'SICKNESS'));
staffAbsence.setSicknessCategory(
  await api.retrieve<StaffAbsenceSicknessCategory>(ResourceType.STAFF_ABSENCE_SICKNESS_CATEGORY, 'IOM_10'),
);
staffAbsence.setSicknessSubcategory(
  await api.retrieve<StaffAbsenceSicknessSubcategory>(ResourceType.STAFF_ABSENCE_SICKNESS_SUBCATEGORY, 'IOM_10001'),
);
staffAbsence.setApprovedDatetime(new Date());
staffAbsence.setApprovedByStaff(staff); // in the real world this would be a different staff member
staffAbsence.setNarrative('Called in sick');
staffAbsence.setActualWorkingDays(daysLost);
staffAbsence.setWorkingDays(daysLost);
staffAbsence.setActualWorkingHours(daysLost * 8);
staffAbsence.setWorkingHours(daysLost * 8);
await staffAbsence.save();

const staffAbsenceCopy = await api.retrieve(ResourceType.STAFF_ABSENCE, staffAbsence.getResourceId()!);
dump(staffAbsenceCopy);
