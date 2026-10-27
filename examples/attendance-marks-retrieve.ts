import { CalendarEntryMapping, Query, ResourceType } from '../src/index.js';
import { api } from './bootstrap.js';

const student = await api.retrieve(ResourceType.STUDENT, 1224);

const calendarEntryMappingQuery = new Query(ResourceType.CALENDAR_ENTRY_MAPPING)
  .addPropertyFilter(CalendarEntryMapping.START_DATETIME, Query.OPERATOR_AFTER, '2018-10-08 08:00:00')
  .addPropertyFilter(CalendarEntryMapping.END_DATETIME, Query.OPERATOR_BEFORE, '2018-10-10 08:00:00')
  .addPropertyFilter(CalendarEntryMapping.MAPPED, Query.OPERATOR_EQUALS, student);

const calendarEntryMappings = await CalendarEntryMapping.query(calendarEntryMappingQuery);

for (const cem of calendarEntryMappings) {
  await cem.load(); // query results are references
  const calendar = await cem.getCalendar()?.load();
  console.log(
    `Calendar ID: ${calendar?.getProperty('id')}, Event Type: ${cem.getEvent()?.getResourceType()}, ` +
      `StartDatetime: ${cem.getStartDatetime()?.toISOString()}, EndDatetime: ${cem.getEndDatetime()?.toISOString()}`,
  );
}
