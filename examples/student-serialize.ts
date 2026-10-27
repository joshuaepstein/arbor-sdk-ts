import { ModelBase, Student } from '../src/index.js';
import { dump } from './bootstrap.js';

// PHP serialize()/unserialize() become JSON.stringify() and ModelBase.fromJSON().
const model = await Student.retrieve(1);
const serialized = JSON.stringify(model);

console.log('Serialized:');
console.log(serialized + '\n');
console.log('Unserialized:');

const model2 = ModelBase.fromJSON(JSON.parse(serialized)) as Student;
dump(model2);
