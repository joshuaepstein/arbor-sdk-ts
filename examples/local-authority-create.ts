import { LocalAuthority, ResourceType, type Country } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const country = await api.retrieve<Country>(ResourceType.COUNTRY, 'GBR');

const model = new LocalAuthority();
model.setName('Test Local Authority');
model.setCode('001');
model.setCountry(country);
await model.save();

dump(model);
