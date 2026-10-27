import { Person, ResourceType, type Ethnicity, type Gender, type Religion, type Student, type Title } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const student = await api.retrieve<Student>(ResourceType.STUDENT, 137);

// As in the PHP original, this attaches a brand-new Person to the student.
const person = new Person();
person.setDateOfBirth(new Date(2000, 0, 1));
person.setLegalFirstName('Simbada');
person.setLegalLastName('Sailor');
person.setGender(await api.retrieve<Gender>(ResourceType.GENDER, 'FEMALE'));
person.setTitle(await api.retrieve<Title>(ResourceType.TITLE, 'MR'));
student.setPerson(person);
student.setEthnicity(await api.retrieve<Ethnicity>(ResourceType.ETHNICITY, 'WBRI'));
student.setReligion(await api.retrieve<Religion>(ResourceType.RELIGION, 'CHRISTIAN'));
student.tag('tagName', 123);

await person.save();
await student.save();

const studentCopy = await api.retrieve(ResourceType.STUDENT, student.getResourceId()!);
dump(studentCopy);
