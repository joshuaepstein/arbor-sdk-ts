import { Query, ResourceType, StaffContract } from '../src/index.js';
import { dump } from './bootstrap.js';

const date = new Date();

// Contracts that have already ended.
const contracts = new Query(ResourceType.STAFF_CONTRACT)
  .addPropertyFilter(StaffContract.START_DATE, Query.OPERATOR_BEFORE, date)
  .addPropertyFilter(StaffContract.END_DATE, Query.OPERATOR_BEFORE, date);

const pastStaff = await StaffContract.query(contracts);

for (const contract of pastStaff) {
  dump(contract);
}
