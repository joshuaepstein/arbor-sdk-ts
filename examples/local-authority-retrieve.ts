import { ResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const model = await api.retrieve(ResourceType.LOCAL_AUTHORITY, '001');

dump(model);
