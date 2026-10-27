import { Query, ResourceType, type PermanentExclusion } from '../src/index.js';
import { api } from './bootstrap.js';

const permanentExclusions = await api.query<PermanentExclusion>(new Query(ResourceType.PERMANENT_EXCLUSION));

for (const permanentExclusion of permanentExclusions) {
  // Query results and related models are references; load what we read from.
  await permanentExclusion.load();
  const exclusionReason = await permanentExclusion.getExclusionReason()?.load();
  const student = await permanentExclusion.getStudent()?.load();
  const person = await student?.getPerson()?.load();

  console.log(`
    Permanent Exclusion Display Name: ${permanentExclusion.getDisplayName()}
    Permanent Exclusion from date: ${permanentExclusion.getFromDate()?.toISOString()}
    Permanent Exclusion narrative: ${permanentExclusion.getNarrative()}
    Exclusion Reason Id: ${exclusionReason?.getId()}
    Exclusion Reason Name: ${exclusionReason?.getExclusionReasonName()}
    Exclusion Reason Code: ${exclusionReason?.getCode()}
    Student Id: ${student?.getId()}
    Student First Name: ${person?.getLegalFirstName()}
    Student Last Name: ${person?.getLegalLastName()}
  `);
}
