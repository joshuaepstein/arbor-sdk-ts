import { Person, Query, ResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// People with an empty first name and no date of birth (`null` is sent as NULL).
const query = new Query(ResourceType.PERSON)
  .addPropertyFilter(Person.LEGAL_FIRST_NAME, Query.OPERATOR_EQUALS, '')
  .addPropertyFilter(Person.DATE_OF_BIRTH, Query.OPERATOR_EQUALS, null);

const modelCollection = await api.query(query);

for (const model of modelCollection) {
  dump(model);
}
