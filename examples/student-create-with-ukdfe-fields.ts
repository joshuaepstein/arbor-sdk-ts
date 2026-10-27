import { Person, ResourceType, Student, type Ethnicity, type Gender, type Religion, type Title } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const person = new Person();
person.setDateOfBirth(new Date(2000, 0, 1));
person.setLegalFirstName('Simbad');
person.setLegalLastName('Sailor');
person.setGender(await api.retrieve<Gender>(ResourceType.GENDER, 'MALE'));
person.setTitle(await api.retrieve<Title>(ResourceType.TITLE, 'MR'));

const student = new Student();
student.setPerson(person);
student.setEthnicity(await api.retrieve<Ethnicity>(ResourceType.ETHNICITY, 'AAFR'));
student.setReligion(await api.retrieve<Religion>(ResourceType.RELIGION, 'CHRISTIAN'));
student.setUniqueLearnerNumber(1000000000); // UK DfE field
student.tag('sims-id', 123);

await person.save();
await student.save();

const studentCopy = await api.retrieve(ResourceType.STUDENT, student.getResourceId()!);
dump(studentCopy);
