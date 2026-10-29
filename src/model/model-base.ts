import { ModelError } from '../errors.js';
import type { Gateway } from '../api/gateway.js';
import { Collection } from './collection.js';
import { Hydrator, type Representation } from './hydrator.js';
import { parseArborDate } from '../util/date.js';

export type UserTags = Record<string, unknown>;

/**
 * Base class for every Arbor resource (PHP: `Arbor\Model\ModelBase`).
 *
 * Generated subclasses add typed `getX()` / `setX()` accessors. Getters are
 * synchronous and return what has been loaded so far; use {@link load} or
 * {@link fetchProperty} to pull data from the API. (The PHP SDK lazy-loads
 * inside getters, which can't be done synchronously in JavaScript.)
 */
export class ModelBase {
  private static defaultGateway: Gateway | null = null;

  protected properties: Record<string, unknown> = {};
  protected apiGateway: Gateway | null = null;
  protected resourceUrl: string | null = null;
  protected resourceType: string | null = null;
  protected displayName: string | null = null;

  constructor(
    resourceType: string | null = null,
    properties: Record<string, unknown> = {},
    gateway: Gateway | null = ModelBase.getDefaultGateway(),
  ) {
    if (resourceType !== null) this.resourceType = resourceType;
    this.properties = { ...properties };
    this.apiGateway = gateway;
  }

  static setDefaultGateway(gateway: Gateway | null): void {
    ModelBase.defaultGateway = gateway;
  }

  static getDefaultGateway(): Gateway | null {
    return ModelBase.defaultGateway;
  }

  /** @internal Used by generated static `query()` / `retrieve()` helpers. */
  static requireDefaultGateway(method: string): Gateway {
    const gateway = ModelBase.defaultGateway;
    if (!gateway) {
      throw new ModelError(`You must call ModelBase.setDefaultGateway() prior to calling ${method}()`);
    }
    return gateway;
  }

  getResourceUrl(): string | null {
    return this.resourceUrl;
  }

  setResourceUrl(resourceUrl: string | null): void {
    this.resourceUrl = resourceUrl;
  }

  /** The id segment of the resource URL, e.g. `12` from `/rest-v2/students/12`. */
  getResourceId(): string | null {
    if (!this.resourceUrl) return null;
    return this.resourceUrl.replace(/^\/+|\/+$/g, '').split('/')[2] ?? null;
  }

  connect(gateway: Gateway | null): this {
    this.apiGateway = gateway;
    return this;
  }

  getApiGateway(): Gateway | null {
    return this.apiGateway;
  }

  getProperties(): Record<string, unknown> {
    return this.properties;
  }

  setProperties(properties: Record<string, unknown>): void {
    this.properties = { ...properties };
  }

  /**
   * True when the API sent only `{ entityType }`: no link and no data. Arbor
   * does this for records the app isn't allowed to read, and for some records
   * nested two levels deep. Calling `load()` on one won't help, since there's no URL.
   */
  isRedacted(): boolean {
    return !this.resourceUrl && Object.keys(this.properties).length === 0 && this.resourceType !== null;
  }

  /** True when this is only a link (`href`, maybe `id`): call `load()` for the rest. */
  isReference(): boolean {
    return !!this.resourceUrl && Object.keys(this.properties).every((k) => k === 'id' || k === 'uniqueObjectId');
  }

  hasProperty(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.properties, name);
  }

  /** The loaded value of a property, or `null` if it hasn't been loaded. */
  getProperty<T = unknown>(name: string): T | null {
    return this.hasProperty(name) ? (this.properties[name] as T) : null;
  }

  /**
   * A date property as a `Date`. The API sends dates as strings such as
   * `"2010-11-20 00:00:00"`; they're parsed when read and stored unchanged,
   * so an untouched date never shows up in an update.
   */
  getDateProperty(name: string): Date | null {
    const value = this.getProperty<unknown>(name);
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const date = parseArborDate(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' && typeof (value as { date?: unknown }).date === 'string') {
      return parseArborDate((value as { date: string }).date);
    }
    return null;
  }

  setProperty(name: string, value: unknown): void {
    this.properties[name] = value;
  }

  /** The loaded collection property, or an empty collection. */
  getCollectionProperty<T extends ModelBase = ModelBase>(name: string): Collection<T> {
    const value = this.properties[name];
    if (value instanceof Collection) return value as Collection<T>;
    const empty = new Collection<T>();
    this.properties[name] = empty;
    return empty;
  }

  /**
   * Returns a property, refreshing from the API first if it isn't loaded yet
   * and the model has a resource URL. This is the async equivalent of the
   * PHP SDK's lazy-loading getters.
   */
  async fetchProperty<T = unknown>(name: string): Promise<T | null> {
    if (!this.hasProperty(name) && this.resourceUrl) await this.refresh();
    return this.getProperty<T>(name);
  }

  /** Re-fetches the model from the API and updates it in place. */
  async refresh(): Promise<this> {
    if (!this.apiGateway) {
      throw new ModelError(`Trying to refresh an unconnected model: ${this.resourceUrl ?? '(no URL)'}`);
    }
    await this.apiGateway.refresh(this);
    return this;
  }

  /** Alias of {@link refresh}, handy for related models that only arrived as a reference. */
  load(): Promise<this> {
    return this.refresh();
  }

  /** Creates the model if it has no resource URL yet, otherwise updates it. */
  async save(): Promise<this> {
    if (!this.apiGateway) {
      throw new ModelError('Trying to save an unconnected model. Please call connect() first.');
    }
    if (this.resourceUrl) await this.apiGateway.update(this);
    else await this.apiGateway.create(this);
    return this;
  }

  /** Deletes the model through its gateway. */
  async delete(): Promise<unknown> {
    if (!this.apiGateway) throw new ModelError('Trying to delete an unconnected model.');
    return this.apiGateway.delete(this);
  }

  setResourceType(resourceType: string | null): void {
    this.resourceType = resourceType;
  }

  getResourceType(): string | null {
    return this.resourceType;
  }

  setDisplayName(displayName: string | null): void {
    this.displayName = displayName;
  }

  getDisplayName(): string | null {
    return this.displayName;
  }

  getId(): string | number | null {
    return this.getProperty('id');
  }

  getUniqueObjectId(): string | null {
    return this.getProperty('uniqueObjectId');
  }

  setUserTags(tags: UserTags): void {
    this.setProperty('userTags', tags);
  }

  getUserTags(): UserTags {
    let tags = this.getProperty<UserTags>('userTags');
    if (tags === null || typeof tags !== 'object') {
      tags = {};
      this.setUserTags(tags);
    }
    return tags;
  }

  tag(tagName: string, value: unknown): this {
    this.getUserTags()[tagName] = value;
    return this;
  }

  /** The API representation of this model (PHP: `Hydrator::extractArray()`), used by `JSON.stringify`. */
  toJSON(): Representation {
    return new Hydrator().extractArray(this);
  }

  /** Rebuilds a model from {@link toJSON} output (PHP: `unserialize()`). */
  static fromJSON(representation: Representation, gateway: Gateway | null = ModelBase.getDefaultGateway()): ModelBase {
    return new Hydrator().hydrateNew(representation, gateway);
  }
}
