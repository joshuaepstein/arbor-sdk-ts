import { Query, ResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const modelCollection = await api.query(new Query(ResourceType.STUDENT));

for (const model of modelCollection) {
  dump(model);
}
