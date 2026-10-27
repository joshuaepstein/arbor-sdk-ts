import { Person, Query, ResourceType, Student } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const personQuery = new Query(ResourceType.PERSON).addPropertyFilter(Person.LEGAL_LAST_NAME, Query.OPERATOR_EQUALS, 'Adams');
const personsCollection = await api.query(personQuery);

for (const person of personsCollection) {
  const studentQuery = new Query(ResourceType.STUDENT).addPropertyFilter(Student.PERSON, Query.OPERATOR_EQUALS, person);
  const studentCollection = await api.query(studentQuery);

  for (const student of studentCollection) {
    dump(student);
  }
}
