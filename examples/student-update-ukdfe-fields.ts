import { ResourceType, type Student } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const student = await api.retrieve<Student>(ResourceType.STUDENT, 137);
student.setUniqueLearnerNumber(1000000000); // UK DfE field
await student.save();

const studentCopy = await api.retrieve(ResourceType.STUDENT, student.getResourceId()!);
dump(studentCopy);
