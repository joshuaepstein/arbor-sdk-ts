import { Query, ResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Filter by a system tagging rather than a property.
const staffQuery = new Query(ResourceType.STAFF).setTaggings(['STAFF__CURRENT_TEACHING_STAFF']);
const modelCollection = await api.query(staffQuery);

for (const model of modelCollection) {
  dump(model);
}
