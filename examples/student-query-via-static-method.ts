import { Query, ResourceType, Student } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const ethnicity = await api.retrieve(ResourceType.ETHNICITY, 'AAFR');

// No resource type needed: Student.query() sets it.
const query = new Query().addPropertyFilter(Student.ETHNICITY, Query.OPERATOR_EQUALS, ethnicity);
const modelCollection = await Student.query(query);

for (const model of modelCollection) {
  dump(model);
}
