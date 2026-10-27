import { Collection, Person, ResourceType, ServerError, Student, type ModelBase } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Stand-ins for the Faker names the PHP example used.
const FIRST_NAMES = ['Ada', 'Alan', 'Grace', 'Linus', 'Margaret', 'Tim', 'Barbara', 'Ken'];
const LAST_NAMES = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Hamilton', 'Berners-Lee', 'Liskov', 'Thompson'];
const pick = (names: string[]) => names[Math.floor(Math.random() * names.length)]!;

type BulkResult = { status: { success: boolean; errors: string[] } };

const persons = new Collection<Person>();
const students = new Collection<Student>();

for (let i = 0; i <= 3; i++) {
  const person = new Person();
  person.setLegalFirstName(pick(FIRST_NAMES));
  person.setLegalLastName(pick(LAST_NAMES));
  persons.add(person);

  const student = new Student();
  student.setPerson(person);
  students.add(student);
}

/** Bulk-creates `models`, reporting which ones the server rejected. */
async function bulkCreate(resourceType: string, models: Collection<ModelBase>, label: string): Promise<void> {
  try {
    await api.bulkCreate(resourceType, models);
  } catch (error) {
    if (!(error instanceof ServerError)) throw error;
    const results = (error.responsePayload as { results?: BulkResult[] } | null)?.results ?? [];
    results.forEach((result, key) => {
      if (!result.status.success) {
        console.log(`Failed to insert ${label}: ${result.status.errors[0]}`);
        dump(models[key]);
      }
    });
  }
}

await bulkCreate(ResourceType.PERSON, persons, 'person');
await bulkCreate(ResourceType.STUDENT, students, 'student');
