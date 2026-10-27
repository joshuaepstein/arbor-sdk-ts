import { Student, UkDfe, UkDfeResourceType } from '../src/index.js';
import { api, dump } from './bootstrap.js';

// Module models (here UK DfE) live in namespaces: UkDfe.EarlyYearsPupilPremiumRecipient, etc.
const student = await Student.retrieve(77);

const pupilPremium = new UkDfe.EarlyYearsPupilPremiumRecipient();
pupilPremium.setStudent(student);
pupilPremium.setStartDate(new Date());
pupilPremium.setEndDate(new Date());
pupilPremium.setRecipientForEconomicReasons(true);
pupilPremium.setRecipientForOtherReasons(false);
await pupilPremium.save();

const br = await api.retrieve(UkDfeResourceType.UK_DFE_EARLY_YEARS_PUPIL_PREMIUM_RECIPIENT, pupilPremium.getResourceId()!);
dump(br);
