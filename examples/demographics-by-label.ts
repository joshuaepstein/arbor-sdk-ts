import { InverseDemographic, Query, ResourceType } from '../src/index.js';
import './bootstrap.js';

const labels = ['EAL', 'Ever 6 FSM', 'FSM', 'In Care', 'Pupil Premium', 'Gifted + Talented', 'Gifted', 'Talented'];

// The PHP original declared these labels but only passed 'EAL' to the IN filter; this passes the whole list.
const query = new Query(ResourceType.INVERSE_DEMOGRAPHIC).addPropertyFilter(
  InverseDemographic.DEMOGRAPHIC,
  Query.OPERATOR_IN,
  labels,
);
const demographics = await InverseDemographic.query(query);

for (const inverseDemographic of demographics) {
  await inverseDemographic.load(); // query results are references
  const demographic = await inverseDemographic.getDemographic()?.load();
  console.log(`Demographics Display Name: ${demographic?.getCode()}`);
}
