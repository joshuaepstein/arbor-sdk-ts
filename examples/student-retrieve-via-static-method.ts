import { Student } from '../src/index.js';
import { dump } from './bootstrap.js';

const model = await Student.retrieve(1);
dump(model);
