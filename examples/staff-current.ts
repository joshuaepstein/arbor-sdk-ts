import { Query, ResourceType, StaffContract } from '../src/index.js';
import { dump } from './bootstrap.js';

const date = new Date();

// Contracts that have started and have no end date.
const contracts = new Query(ResourceType.STAFF_CONTRACT)
  .addPropertyFilter(StaffContract.START_DATE, Query.OPERATOR_BEFORE, date)
  .addPropertyFilter(StaffContract.END_DATE, Query.OPERATOR_EQUALS, null);

const currentStaff = await StaffContract.query(contracts);

for (const current of currentStaff) {
  dump(current);
}
