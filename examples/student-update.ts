import { ResourceType, type Ethnicity, type Gender, type Religion, type Student, type Title } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const student = await api.retrieve<Student>(ResourceType.STUDENT, 137);

// The student's person comes back as a reference; load it before editing.
const person = await student.getPerson()!.load();
person.setDateOfBirth(new Date(2000, 0, 1));
person.setLegalFirstName('Simbad');
person.setLegalLastName('Sailor');
person.setGender(await api.retrieve<Gender>(ResourceType.GENDER, 'FEMALE'));
person.setTitle(await api.retrieve<Title>(ResourceType.TITLE, 'MR'));

student.setUniqueLearnerNumber(1000000000);
student.setEthnicity(await api.retrieve<Ethnicity>(ResourceType.ETHNICITY, 'WBRI'));
student.setReligion(await api.retrieve<Religion>(ResourceType.RELIGION, 'CHRISTIAN'));
student.setEthnicitySource('P');

// save() sends only the properties that changed.
await person.save();
await student.save();

const studentCopy = await api.retrieve(ResourceType.STUDENT, student.getResourceId()!);
dump(studentCopy);
