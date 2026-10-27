import { Person, ResourceType, Staff, type Ethnicity, type Gender, type Religion, type Title, StaffContract, type StaffEmploymentType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Create a staff member to hold the contract.
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
staff.tag('example-reference-id', 123);
await person.save();
await staff.save();

// Create the contract
const staffEmploymentType = await api.retrieve<StaffEmploymentType>(ResourceType.STAFF_EMPLOYMENT_TYPE, 'PERMANENT');
const staffContract = new StaffContract();
staffContract.setStaff(staff);
staffContract.setContractName('Meal Supervisor');
staffContract.setContractReference('Support Staff');
staffContract.setStaffEmploymentType(staffEmploymentType);
staffContract.setIssuedDate(new Date());
staffContract.setStartDate(new Date());
staffContract.setEndDate(new Date());
staffContract.setExpectedEndDate(null);
staffContract.setPayrollNumber('123');
await staffContract.save();

const staffContractCopy = await api.retrieve(ResourceType.STAFF_CONTRACT, staffContract.getResourceId()!);
dump(staffContractCopy);
