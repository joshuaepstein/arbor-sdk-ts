import { ResourceType, type LocalAuthority } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const model = await api.retrieve<LocalAuthority>(ResourceType.LOCAL_AUTHORITY, '001');
model.setShortName('Test');
model.tag('colour', 'green');
await model.save();

dump(model);
