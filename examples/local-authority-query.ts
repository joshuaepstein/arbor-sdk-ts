import { LocalAuthority, Query } from '../src/index.js';
import { dump } from './bootstrap.js';

// Find local authorities by user tag. LocalAuthority.query() sets the resource type.
const results = await LocalAuthority.query(new Query(null, { userTagFilters: [{ tagName: 'colour', value: 'green' }] }));

for (const model of results) {
  dump(model);
  dump(model.getUserTags());
}
