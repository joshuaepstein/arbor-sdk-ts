import { ResourceType, StaffAbsence, type Staff, type StaffAbsenceCategory } from '../src/index.js';
import { api, dump } from './bootstrap.js';

const staffApproved = await api.retrieve<Staff>(ResourceType.STAFF, 16);

const staffAbsence = new StaffAbsence();
staffAbsence.setStaff(staffApproved);
staffAbsence.setStartDatetime(new Date());
staffAbsence.setEndDatetime(new Date(Date.now() + 24 * 60 * 60 * 1000)); // +1 day
staffAbsence.setStaffAbsenceCategory(await api.retrieve<StaffAbsenceCategory>(ResourceType.STAFF_ABSENCE_CATEGORY, 'SICKNESS'));
staffAbsence.setApprovedDatetime(new Date());
staffAbsence.setApprovedByStaff(staffApproved);
staffAbsence.setNarrative('Sickness - working remotely');
await staffAbsence.save();

const staffAbsenceCopy = await api.retrieve(ResourceType.STAFF_ABSENCE, staffAbsence.getResourceId()!);
dump(staffAbsenceCopy);
