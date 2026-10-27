import { ResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const model = await api.retrieve(ResourceType.STUDENT, 1);
dump(model);
