export { createClient, type CreateClientOptions } from './client.js';

export { RestGateway, detectImageType, looselyEqual, type Gateway, type ProfilePicture, type ProfilePictureOwner, type PropertyFilterMap, type QueryOptions, type CurrentOptions, type RestGatewayOptions } from './api/gateway.js';
export {
  HttpClient,
  HttpMethod,
  buildQueryString,
  type ApiResponse,
  type FetchLike,
  type HttpClientInterface,
  type HttpClientOptions,
  type RequestOptions,
} from './api/http-client.js';
export { UploadFile, type UploadContents } from './api/upload-file.js';

export {
  ArborError,
  GatewayError,
  ModelError,
  QueryError,
  ResourceNotFoundError,
  ServerError,
  ServerValidationError,
  type ServerErrorDetails,
} from './errors.js';

export { Query, Operator, type FilterValue, type PropertyFilter, type QueryInit, type QueryParams, type UserTagFilter } from './query/query.js';
export { CamelCaseToDash, PluralizeFilter, type Filter } from './filter/filters.js';
export { Change } from './changelog/change.js';

export { ModelBase, type UserTags } from './model/model-base.js';
export { Collection } from './model/collection.js';
export { Hydrator, type Representation } from './model/hydrator.js';
export { instantiateModel, isModelRegistered, registerModel, type ModelFactory } from './model/registry.js';

export { AttendanceRegistration, AttendanceRollCallRegistration, StandardizedAssessmentMarks } from './service/services.js';
export { TimetableService, type Lesson, type TimetableRange } from './service/timetable.js';
export { StudentService, type ContactDetails, type ContactOptions, type ContactPart, type GuardianInfo } from './service/students.js';
export type { AttendanceMarkEntry, RollCallMarkEntry, StandardizedAssessmentMarkEntry } from './service/services.js';

export * from './resource/resource-type.js';
export * from './models/index.js';
export { registerGeneratedModels } from './models/registry.generated.js';

import { registerGeneratedModels } from './models/registry.generated.js';
// So ModelBase.fromJSON() / Hydrator hydrate typed models even before a gateway exists.
registerGeneratedModels();
export { formatArborDate, parseArborDate } from './util/date.js';
