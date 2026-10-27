import { Person, ResourceType, Staff, type Ethnicity, type Gender, type Religion, type Title } from '../src/index.js';
import { api, dump } from './bootstrap.js';

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

// Save the person first so the staff record can reference it.
await person.save();
await staff.save();

const staffCopy = await api.retrieve<Staff>(ResourceType.STAFF, staff.getResourceId()!);
dump(staffCopy);
dump(staffCopy.getUserTags());
