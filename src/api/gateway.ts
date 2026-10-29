import { Change } from '../changelog/change.js';
import { GatewayError, QueryError, ServerError } from '../errors.js';
import { CamelCaseToDash, PluralizeFilter } from '../filter/filters.js';
import { Collection } from '../model/collection.js';
import { Hydrator, type Representation } from '../model/hydrator.js';
import type { ModelBase } from '../model/model-base.js';
import { instantiateModel } from '../model/registry.js';
import { registerGeneratedModels } from '../models/registry.generated.js';
import { TimetableService, type Lesson, type TimetableRange } from '../service/timetable.js';
import { StudentService, type ContactDetails, type GuardianInfo } from '../service/students.js';
import type { AcademicLevel } from '../models/AcademicLevel.js';
import type { RegistrationForm } from '../models/RegistrationForm.js';
import { Query, type FilterValue } from '../query/query.js';
import { HttpMethod, type ApiResponse, type HttpClientInterface } from './http-client.js';
import type { UploadFile } from './upload-file.js';

/** What models need from a gateway (PHP: `Arbor\Api\Gateway\GatewayInterface`). */
export interface Gateway {
  create<T extends ModelBase>(model: T): Promise<T>;
  retrieve<T extends ModelBase = ModelBase>(resourceType: string, id: string | number): Promise<T>;
  update<T extends ModelBase>(model: T): Promise<T>;
  delete(model: ModelBase): Promise<ApiResponse>;
  query<T extends ModelBase = ModelBase>(query: Query, options?: QueryOptions): Promise<Collection<T>>;
  refresh<T extends ModelBase>(model: T): Promise<T>;
  getChanges<T extends ModelBase = ModelBase>(resourceType: string, fromRevision?: number, toRevision?: number): Promise<Change<T>[]>;
  bulkCreate<T extends ModelBase>(resourceType: string, models: Iterable<T>, checkForPersistence?: boolean): Promise<Collection<T>>;
  upload(endpoint: string, file: UploadFile): Promise<ApiResponse>;
  setApplicationId(applicationId: string): this;
  getApplicationId(): string | null;
}

/** A downloaded profile picture. */
export interface ProfilePicture {
  data: Uint8Array;
  /** Detected from the file itself, since Arbor sends `application/octet-stream`. */
  contentType: string;
  /** File extension to use when saving, e.g. `jpg`. */
  extension: string;
}

export type ProfilePictureOwner = 'student' | 'staff';

/** Identifies an image from its first bytes. */
export function detectImageType(data: Uint8Array): { contentType: string; extension: string } {
  const hex = Array.from(data.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('ffd8ff')) return { contentType: 'image/jpeg', extension: 'jpg' };
  if (hex.startsWith('89504e47')) return { contentType: 'image/png', extension: 'png' };
  if (hex.startsWith('47494638')) return { contentType: 'image/gif', extension: 'gif' };
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return { contentType: 'image/webp', extension: 'webp' };
  return { contentType: 'application/octet-stream', extension: 'bin' };
}

export interface CurrentOptions {
  /** The moment to test against. Default: now. */
  at?: Date;
  /** The end-date property. Default `endDate`. */
  endProperty?: string;
}

export interface QueryOptions {
  /**
   * Load each result's full record. Listings only return references (id and
   * href). Loads are paced and duplicates merged, so this is safe for large results.
   */
  load?: boolean;
  /**
   * Only records that haven't ended: the end date is after `at`, **or** it's
   * empty (ongoing). Arbor's `endDate.after` filter alone drops ongoing
   * records, so this runs both queries and merges them. Records that start
   * in the future are included.
   */
  current?: boolean | CurrentOptions;
}

/** `{ property: value }` or `{ property: [operator, value] }`. */
export type PropertyFilterMap = Record<string, Exclude<FilterValue, readonly unknown[]> | [string, FilterValue]>;

export interface RestGatewayOptions {
  hydrator?: Hydrator;
  camelCaseToDash?: CamelCaseToDash;
  pluralizeFilter?: PluralizeFilter;
  /**
   * Keep single-record responses (`retrieve()`, `refresh()` / `load()`) for this
   * long and reuse them. Default 0 (off). Saving or deleting a record through
   * this gateway clears its entry; {@link RestGateway.clearCache} clears everything.
   * Identical requests already in flight are always merged, cache or not.
   */
  cacheTtlMs?: number;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const NUMERIC = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;

/** PHP 8's loose `==` for the scalar values the API returns (used by the update diff). */
export function looselyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) {
    const other = a == null ? b : a;
    return other == null || other === '' || other === false || other === 0;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const toBool = (v: unknown) => (v === '0' ? false : Boolean(v));
    return toBool(a) === toBool(b);
  }
  const numeric = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && NUMERIC.test(v));
  if (numeric(a) && numeric(b)) return Number(a) === Number(b);
  return false;
}

/**
 * CRUD, query, changelog and bulk operations against `/rest-v2`
 * (PHP: `Arbor\Api\Gateway\PsrRestGateway`).
 */
export class RestGateway implements Gateway {
  protected applicationId: string | null = null;
  readonly hydrator: Hydrator;
  protected readonly camelCaseToDash: CamelCaseToDash;
  protected readonly pluralizeFilter: PluralizeFilter;
  protected cacheTtlMs: number;
  private readonly inFlight = new Map<string, Promise<ApiResponse>>();
  private readonly cache = new Map<string, { at: number; value: ApiResponse }>();

  constructor(
    protected readonly httpClient: HttpClientInterface,
    options: RestGatewayOptions = {},
  ) {
    registerGeneratedModels();
    this.hydrator = options.hydrator ?? new Hydrator();
    this.camelCaseToDash = options.camelCaseToDash ?? new CamelCaseToDash();
    this.pluralizeFilter = options.pluralizeFilter ?? new PluralizeFilter();
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 0);
  }

  /** Turns the single-record cache on (ms > 0) or off (0). */
  setCacheTtl(ms: number): this {
    this.cacheTtlMs = Math.max(0, ms);
    if (this.cacheTtlMs === 0) this.cache.clear();
    return this;
  }

  /** Drops one cached record (by resource URL), or everything. */
  clearCache(resourceUrl?: string): void {
    if (resourceUrl === undefined) this.cache.clear();
    else this.cache.delete(resourceUrl);
  }

  /**
   * GET for a single record: merges identical in-flight requests and, if
   * enabled, serves from the cache. Returns a copy, so callers can't change
   * the cached value.
   */
  protected async getRecord(url: string, fresh = false): Promise<ApiResponse> {
    if (!fresh && this.cacheTtlMs > 0) {
      const hit = this.cache.get(url);
      if (hit && Date.now() - hit.at < this.cacheTtlMs) return structuredClone(hit.value);
    }
    let pending = this.inFlight.get(url);
    if (!pending) {
      pending = this.httpClient.sendRequest(HttpMethod.GET, url).finally(() => this.inFlight.delete(url));
      this.inFlight.set(url, pending);
    }
    const value = await pending;
    if (this.cacheTtlMs > 0) this.cache.set(url, { at: Date.now(), value });
    return structuredClone(value);
  }

  getHttpClient(): HttpClientInterface {
    return this.httpClient;
  }

  getApplicationId(): string | null {
    return this.applicationId;
  }

  setApplicationId(applicationId: string): this {
    this.applicationId = applicationId;
    this.httpClient.setApplicationId(applicationId);
    return this;
  }

  async create<T extends ModelBase>(model: T): Promise<T> {
    const type = this.requireType(model);
    const root = this.getResourceRoot(type);
    const body = { request: { [root]: this.hydrator.extractArray(model) } };

    const response = await this.httpClient.sendRequest(HttpMethod.POST, this.buildUrl(this.getResource(type)), { body });
    if (!(root in response)) throw new QueryError(`API Error: ${JSON.stringify(response)}`);

    this.hydrator.hydrateModel(model, response[root]);
    return model;
  }

  /**
   * Creates several resources in one request. Intended for Students,
   * StudentMembership, StudentSecondaryMembership, Staff, Exams and Documents.
   */
  async bulkCreate<T extends ModelBase>(resourceType: string, models: Iterable<T>, checkForPersistence = true): Promise<Collection<T>> {
    const root = this.getResourceRoot(resourceType);
    const created = new Collection<T>();
    const request: Record<string, Representation>[] = [];

    for (const model of models) {
      await this.validateModelForBulkCreate(model, checkForPersistence, resourceType);
      created.add(model);
      request.push({ [root]: this.hydrator.extractArray(model) });
    }

    let response: ApiResponse;
    try {
      response = await this.httpClient.sendRequest(HttpMethod.POST, this.buildUrl(this.getResource(resourceType)), {
        body: { request },
      });
    } catch (e) {
      if (!(e instanceof ServerError)) throw e;
      const payload = e.responsePayload as ApiResponse | null;
      const failed = (Array.isArray(payload?.results) ? payload.results : [])
        .filter((item: any) => item?.status && item.status.success === false)
        .map((item: any) => item.status);
      throw new ServerError(e.message + (failed.length ? `\n${JSON.stringify(failed)}` : ''), {
        cause: e.cause,
        status: e.status,
        requestPayload: e.requestPayload,
        responsePayload: e.responsePayload,
        serverExceptionClass: e.serverExceptionClass,
        serverExceptionMessage: e.serverExceptionMessage,
        serverExceptionTrace: e.serverExceptionTrace,
      });
    }

    const results: any[] = Array.isArray(response.results) ? response.results : [];
    results.forEach((result, i) => {
      const model = created[i];
      if (model && result?.status?.success && result[root]) this.hydrator.hydrateModel(model, result[root]);
    });
    return created;
  }

  async refresh<T extends ModelBase>(model: T): Promise<T> {
    const url = model.getResourceUrl();
    if (!url) throw new QueryError('Cannot refresh a model without a resource URL');
    const type = this.requireType(model);

    const response = await this.getRecord(url);
    const root = this.getResourceRoot(type);
    if (!(root in response)) {
      throw new QueryError(`Resource ${type} with ID ${model.getResourceId()} could not be retrieved from URL: ${url}`);
    }
    this.hydrator.hydrateModel(model, response[root]);
    return model;
  }

  async retrieve<T extends ModelBase = ModelBase>(resourceType: string, id: string | number): Promise<T> {
    const url = this.buildUrl(this.getResource(resourceType), id);
    const response = await this.getRecord(url);
    const root = this.getResourceRoot(resourceType);
    if (!(root in response)) {
      throw new QueryError(`Resource ${resourceType} with ID ${id} could not be retrieved from URL: ${url}`);
    }
    return this.hydrator.hydrateModel(this.instantiateModel(resourceType), response[root]) as T;
  }

  /** First match for the filters, or `null`. Returns `null` without a request when no filters are given. */
  async findOne<T extends ModelBase = ModelBase>(resourceType: string, propertyFilters: PropertyFilterMap = {}, userTags: Record<string, string> = {}): Promise<T | null> {
    if (Object.keys(propertyFilters).length === 0 && Object.keys(userTags).length === 0) return null;
    const models = await this.findAll<T>(resourceType, propertyFilters, userTags);
    return models[0] ?? null;
  }

  /**
   * All matches for `{ property: value }` (equals) or `{ property: [operator, value] }`.
   * `userTags` is accepted for parity with the PHP SDK, which also ignores it here.
   */
  async findAll<T extends ModelBase = ModelBase>(resourceType: string, propertyFilters: PropertyFilterMap = {}, _userTags: Record<string, string> = {}): Promise<T[]> {
    const query = new Query(resourceType);
    for (const [name, filter] of Object.entries(propertyFilters)) {
      // Like the PHP SDK, any array is read as [operator, value]; use ['in', [...]] for lists.
      if (Array.isArray(filter)) {
        query.addPropertyFilter(name, String(filter[0]), filter[1] as FilterValue);
      } else {
        query.addPropertyFilter(name, Query.OPERATOR_EQUALS, filter as FilterValue);
      }
    }
    return (await this.query<T>(query)).getArrayCopy();
  }

  instantiateModel(resourceType: string): ModelBase {
    return instantiateModel(resourceType, this);
  }

  /** Sends only the properties that differ from the server's copy. */
  async update<T extends ModelBase>(model: T): Promise<T> {
    const url = model.getResourceUrl();
    const id = model.getResourceId();
    if (!url || id === null) throw new QueryError('Cannot update a model without a resource URL');
    const type = this.requireType(model);
    const root = this.getResourceRoot(type);

    const current = this.hydrator.extractArray(model);
    // Always diff against the server's current copy, never the cache.
    const fresh = await this.getRecord(url, true);
    if (!(root in fresh)) throw new QueryError(`Resource ${type} with ID ${id} could not be retrieved from URL: ${url}`);
    const previous = this.hydrator.extractArray(this.hydrator.hydrateModel(this.instantiateModel(type), fresh[root]));
    const diff = this.diffRepresentations(current, previous);
    if (Object.keys(diff).length === 0) return model;

    this.clearCache(url);
    const response = await this.httpClient.sendRequest(HttpMethod.PUT, url, { body: { request: { [root]: diff } } });
    if (!(root in response)) throw new QueryError(`API Error: ${JSON.stringify(response)}`);

    this.hydrator.hydrateModel(model, response[root]);
    return model;
  }

  async delete(model: ModelBase): Promise<ApiResponse> {
    const url = model.getResourceUrl();
    if (!url) throw new QueryError('Cannot delete a model without a resource URL');
    this.clearCache(url);
    return this.httpClient.sendRequest(HttpMethod.DELETE, url);
  }

  /**
   * Downloads a student's or staff member's current profile picture from
   * `/rest-v2/profile-picture/{student|staff}/{id}`. Returns `null` if they have none.
   *
   * Needs the `content` and `contentTag` API permissions. Download and store
   * the image yourself: the photo URLs GraphQL returns expire after a while.
   *
   * ```ts
   * const pic = await api.getProfilePicture(student);          // a Student or Staff model
   * const pic = await api.getProfilePicture('student', 4987);  // or a type and id
   * ```
   */
  async getProfilePicture(owner: ModelBase | ProfilePictureOwner, id?: string | number): Promise<ProfilePicture | null> {
    let kind: ProfilePictureOwner;
    let ownerId: string | number | null;
    if (typeof owner === 'string') {
      kind = owner;
      ownerId = id ?? null;
    } else {
      const type = owner.getResourceType();
      if (type !== 'Student' && type !== 'Staff') {
        throw new GatewayError(`Profile pictures are only available for Student and Staff, not ${type}`);
      }
      kind = type === 'Student' ? 'student' : 'staff';
      ownerId = owner.getResourceId();
    }
    if (ownerId === null || ownerId === '') throw new GatewayError('getProfilePicture needs an id (or a saved model)');

    const url = `/rest-v2/profile-picture/${kind}/${ownerId}`;
    const res = await this.httpClient.fetchRaw(url);
    if (res.status === 404 || res.status === 204) return null;
    const data = new Uint8Array(await res.arrayBuffer());
    if (!res.ok) {
      const text = new TextDecoder().decode(data).replace(/\s+/g, ' ').trim().slice(0, 200);
      throw new ServerError(`Profile picture request failed with HTTP ${res.status}${text ? `: ${text}` : ''}`, {
        status: res.status,
        responsePayload: text || null,
      });
    }
    if (data.length === 0) return null;

    const detected = detectImageType(data);
    if (detected.extension === 'bin') {
      // Not an image: most likely a JSON "no picture" response.
      const text = new TextDecoder().decode(data.subarray(0, 300));
      if (text.trimStart().startsWith('{')) return null;
    }
    return { data, ...detected };
  }

  /**
   * Reads a content tag and returns what it's attached to, e.g.
   * `{ entityType: 'Student', id: 4987 }`. Pass the result to {@link getProfilePicture}.
   */
  async getContentTagTarget(contentTagId: string | number): Promise<{ entityType: string; id: number | string } | null> {
    const response = await this.httpClient.sendRequest(HttpMethod.GET, this.buildUrl('content-tags', contentTagId));
    const tagged = response.contentTag?.tagged;
    if (!tagged || !tagged.entityType || tagged.id === undefined) return null;
    return { entityType: tagged.entityType, id: tagged.id };
  }

  /**
   * A student's lessons between `from` (inclusive) and `to` (exclusive),
   * sorted by start time, with class and room names.
   *
   * ```ts
   * const lessons = await api.getStudentTimetable(student, { from: new Date('2026-11-02'), to: new Date('2026-11-07') });
   * ```
   * Takes a Student, its id or its resource URL.
   */
  getStudentTimetable(student: ModelBase | string | number, range: TimetableRange): Promise<Lesson[]> {
    return new TimetableService(this).forStudent(student, range);
  }

  /** A staff member's timetabled lessons in a date range. See {@link getStudentTimetable}. */
  getStaffTimetable(staff: ModelBase | string | number, range: TimetableRange): Promise<Lesson[]> {
    return new TimetableService(this).forStaff(staff, range);
  }

  /** A student's year group (e.g. "Year 12") now or at `at`, or `null`. Takes a Student, id or URL. */
  getYearGroup(student: ModelBase | string | number, at?: Date): Promise<AcademicLevel | null> {
    return new StudentService(this).yearGroup(student, at);
  }

  /** A student's form / registration group (e.g. "12BV") now or at `at`, or `null`. */
  getCurrentForm(student: ModelBase | string | number, at?: Date): Promise<RegistrationForm | null> {
    return new StudentService(this).currentForm(student, at);
  }

  /** Emails, phone numbers and current addresses for a Student or Guardian (a model, or a student id / URL). */
  getContactDetails(owner: ModelBase | string | number): Promise<ContactDetails> {
    return new StudentService(this).contactDetails(owner);
  }

  /** A student's guardians, primary ones first; `{ contacts: true }` includes their contact details. */
  getGuardians(student: ModelBase | string | number, options?: { contacts?: boolean }): Promise<GuardianInfo[]> {
    return new StudentService(this).guardians(student, options);
  }

  /** Uploads a file as `multipart/form-data`. */
  upload(endpoint: string, file: UploadFile): Promise<ApiResponse> {
    return this.httpClient.uploadRequest(endpoint, file);
  }

  /**
   * Changelog entries for a resource type.
   * @param fromRevision only sent when > 0
   * @param toRevision only sent when > -1
   */
  async getChanges<T extends ModelBase = ModelBase>(resourceType: string, fromRevision = 0, toRevision = -1): Promise<Change<T>[]> {
    const query: Record<string, number> = {};
    if (fromRevision > 0) query['from-revision'] = fromRevision;
    if (toRevision > -1) query['to-revision'] = toRevision;

    const url = this.buildUrl(this.getResource(resourceType), 'changelog');
    const response = await this.httpClient.sendRequest(HttpMethod.GET, url, { query });
    if (!Array.isArray(response.changes)) return [];
    return this.hydrateModelChanges<T>(response.changes, resourceType);
  }

  async query<T extends ModelBase = ModelBase>(query: Query, options: QueryOptions = {}): Promise<Collection<T>> {
    let listing: Collection<T>;
    if (options.current) {
      const { at = new Date(), endProperty = 'endDate' } = options.current === true ? {} : options.current;
      const [ending, ongoing] = await Promise.all([
        this.runQuery<T>(query.clone().addPropertyFilter(endProperty, Query.OPERATOR_AFTER, at)),
        this.runQuery<T>(query.clone().addPropertyFilter(endProperty, Query.OPERATOR_EQUALS, null)),
      ]);
      const seen = new Set<string>();
      listing = new Collection<T>();
      for (const m of [...ending, ...ongoing]) {
        const key = m.getResourceUrl() ?? '';
        if (key && seen.has(key)) continue;
        seen.add(key);
        listing.add(m);
      }
    } else {
      listing = await this.runQuery<T>(query);
    }
    if (options.load) await this.loadAll(listing);
    return listing;
  }

  /**
   * Loads every model's full record, paced and with duplicates merged.
   * Returns the same models, now filled in.
   */
  async loadAll<T extends ModelBase>(models: Iterable<T>): Promise<T[]> {
    return Promise.all([...models].map((m) => this.refresh(m)));
  }

  protected async runQuery<T extends ModelBase>(query: Query): Promise<Collection<T>> {
    const type = query.getResourceType();
    if (!type) throw new QueryError('Query has no resource type');

    // Listing URLs use the plural type as-is (e.g. /rest-v2/AcademicUnits), exactly as the PHP SDK does.
    const plural = this.pluralizeFilter.filter(type);
    const root = this.getResourceRoot(plural);
    const response = await this.httpClient.sendRequest(HttpMethod.GET, this.buildUrl(plural), {
      query: query.getQueryOptions(),
    });

    const listing = new Collection<T>();
    if (Array.isArray(response[root])) {
      for (const item of response[root]) {
        listing.add(this.hydrator.hydrateModel(this.instantiateModel(type), item) as T);
      }
    }
    return listing;
  }

  hydrateModelChanges<T extends ModelBase = ModelBase>(changes: any[], resourceType: string): Change<T>[] {
    return changes.map((c) => {
      const model = this.hydrator.hydrateModel(this.instantiateModel(resourceType), c.changedObject ?? {}) as T;
      return new Change(model, c.changeType, c.fromRevision, c.toRevision);
    });
  }

  /**
   * Recursive diff of two representations. For nested resources that changed,
   * `entityType` and `href` are kept since the API needs them.
   */
  diffRepresentations(next: Record<string, unknown>, previous: Record<string, unknown>): Record<string, unknown> {
    const diff: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next)) {
      const prev = previous[key];
      if (typeof value === 'object' && value !== null) {
        if (prev === undefined || prev === null || typeof prev !== 'object') {
          diff[key] = value;
          continue;
        }
        const nested = this.diffRepresentations(value as Record<string, unknown>, prev as Record<string, unknown>);
        if (Object.keys(nested).length === 0) continue;
        if (Array.isArray(value)) {
          diff[key] = value; // send whole lists rather than sparse ones
          continue;
        }
        if (isPlainObject(prev) && 'entityType' in prev) {
          const v = value as Record<string, unknown>;
          nested.entityType = v.entityType;
          nested.href = v.href;
        }
        diff[key] = nested;
      } else if (!(key in previous) || !looselyEqual(prev, value)) {
        diff[key] = value;
      }
    }
    return diff;
  }

  protected buildUrl(resourceSegment: string, id?: string | number): string {
    return id !== undefined ? `/rest-v2/${resourceSegment}/${id}` : `/rest-v2/${resourceSegment}`;
  }

  /** `AcademicUnit` → `academic-units`. */
  getResource(resourceType: string): string {
    return this.camelCaseToDash.filter(this.pluralizeFilter.filter(resourceType)).toLowerCase();
  }

  /** `Student` → `student` (the JSON key the resource sits under). */
  getResourceRoot(resourceType: string): string {
    return resourceType.charAt(0).toLowerCase() + resourceType.slice(1);
  }

  protected requireType(model: ModelBase): string {
    const type = model.getResourceType();
    if (!type) throw new GatewayError('Model has no resource type');
    return type;
  }

  protected async validateModelForBulkCreate(model: ModelBase, checkForPersistence: boolean, resourceType: string): Promise<void> {
    if (model.getResourceType() !== resourceType) {
      throw new QueryError(`Not all elements of collection are of type "${resourceType}"`);
    }
    if (model.getResourceUrl() !== null) {
      throw new QueryError(`Model you want to create already exists on "${model.getResourceUrl()}"`);
    }

    const tags = model.getProperty<Record<string, unknown>>('userTags') ?? {};
    if (checkForPersistence && Object.keys(tags).length > 0) {
      const query = new Query(resourceType);
      for (const [name, value] of Object.entries(tags)) query.addUserTagFilter(name, value as string);
      const existing = await this.query(query);
      if (existing.length > 0) {
        throw new QueryError(`Model you want to create already exists on "${existing[0]!.getResourceUrl()}"`);
      }
    }
  }
}
