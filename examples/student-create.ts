import { Person, ResourceType, ServerError, Student, type Gender } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Stand-ins for the Faker names the PHP example used.
const FIRST_NAMES = ['Oliver', 'George', 'Harry', 'Noah', 'Jack', 'Leo'];
const LAST_NAMES = ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson'];
const pick = (names: string[]) => names[Math.floor(Math.random() * names.length)]!;

type ErrorPayload = { status?: { errors?: string[] } } | null;

const person = new Person();
person.setLegalFirstName(pick(FIRST_NAMES));
person.setLegalLastName(pick(LAST_NAMES));

const student = new Student();
student.setPerson(person);
person.setGender(await api.retrieve<Gender>(ResourceType.GENDER, 'MALE'));

try {
  await api.create(person);
} catch (error) {
  if (!(error instanceof ServerError)) throw error;
  console.log(`Failed to insert person: ${(error.responsePayload as ErrorPayload)?.status?.errors?.[0]}`);
}

dump(person);

try {
  await api.create(student);
} catch (error) {
  if (!(error instanceof ServerError)) throw error;
  console.log(`Failed to insert student: ${(error.responsePayload as ErrorPayload)?.status?.errors?.[0]}`);
}

dump(student);
