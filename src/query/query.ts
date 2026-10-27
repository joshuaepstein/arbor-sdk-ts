import { QueryError } from '../errors.js';
import { ModelBase } from '../model/model-base.js';
import { formatArborDate } from '../util/date.js';

export const Operator = {
  EQUALS: 'equals',
  FROM: 'from',
  TO: 'to',
  AFTER: 'after',
  BEFORE: 'before',
  SEARCH: 'search',
  IN: 'in',
} as const;
export type Operator = (typeof Operator)[keyof typeof Operator];

export type FilterValue = string | number | boolean | Date | ModelBase | null | readonly (string | number)[];

export interface PropertyFilter {
  propertyName: string;
  operator: Operator | (string & {});
  value: FilterValue;
}

export interface UserTagFilter {
  tagName: string;
  value: string | number | boolean | Date;
}

export type QueryParams = Record<string, string | number | boolean | readonly (string | number)[]>;

export interface QueryInit {
  resourceType?: string | null;
  propertyFilters?: PropertyFilter[];
  userTagFilters?: UserTagFilter[];
  pageNumber?: number | null;
  pageSize?: number | null;
  taggings?: string[];
  orderProperty?: string | null;
  orderDirection?: string | null;
}

/** Builds the filter / paging query string for a listing request. */
export class Query {
  static readonly OPERATOR_EQUALS = Operator.EQUALS;
  static readonly OPERATOR_FROM = Operator.FROM;
  static readonly OPERATOR_TO = Operator.TO;
  static readonly OPERATOR_AFTER = Operator.AFTER;
  static readonly OPERATOR_BEFORE = Operator.BEFORE;
  static readonly OPERATOR_SEARCH = Operator.SEARCH;
  static readonly OPERATOR_IN = Operator.IN;

  resourceType: string | null;
  propertyFilters: PropertyFilter[];
  userTagFilters: UserTagFilter[];
  pageNumber: number | null;
  pageSize: number | null;
  taggings: string[];
  orderProperty: string | null;
  /** Stored for parity with the PHP SDK; it is not sent to the API (the PHP SDK doesn't send it either). */
  orderDirection: string | null;

  constructor(resourceType: string | null = null, init: Omit<QueryInit, 'resourceType'> = {}) {
    this.resourceType = resourceType;
    this.propertyFilters = [...(init.propertyFilters ?? [])];
    this.userTagFilters = [...(init.userTagFilters ?? [])];
    this.pageNumber = init.pageNumber ?? null;
    this.pageSize = init.pageSize ?? null;
    this.taggings = [...(init.taggings ?? [])];
    this.orderProperty = init.orderProperty ?? null;
    this.orderDirection = init.orderDirection ?? null;
  }

  addPropertyFilter(propertyName: string, operator: PropertyFilter['operator'], value: FilterValue): this {
    this.propertyFilters.push({ propertyName, operator, value });
    return this;
  }

  addUserTagFilter(tagName: string, value: UserTagFilter['value']): this {
    this.userTagFilters.push({ tagName, value });
    return this;
  }

  // Fluent setters, mirroring the PHP accessors.
  setResourceType(resourceType: string | null): this {
    this.resourceType = resourceType;
    return this;
  }
  getResourceType(): string | null {
    return this.resourceType;
  }
  setPageNumber(pageNumber: number | null): this {
    this.pageNumber = pageNumber;
    return this;
  }
  getPageNumber(): number | null {
    return this.pageNumber;
  }
  setPageSize(pageSize: number | null): this {
    this.pageSize = pageSize;
    return this;
  }
  getPageSize(): number | null {
    return this.pageSize;
  }
  setOrderProperty(orderProperty: string | null): this {
    this.orderProperty = orderProperty;
    return this;
  }
  getOrderProperty(): string | null {
    return this.orderProperty;
  }
  setOrderDirection(orderDirection: string | null): this {
    this.orderDirection = orderDirection;
    return this;
  }
  getOrderDirection(): string | null {
    return this.orderDirection;
  }
  setTaggings(taggings: string[]): this {
    this.taggings = [...taggings];
    return this;
  }
  getTaggings(): string[] {
    return this.taggings;
  }
  setPropertyFilters(filters: PropertyFilter[]): this {
    this.propertyFilters = [...filters];
    return this;
  }
  getPropertyFilters(): PropertyFilter[] {
    return this.propertyFilters;
  }
  setUserTagFilters(filters: UserTagFilter[]): this {
    this.userTagFilters = [...filters];
    return this;
  }
  getUserTagFilters(): UserTagFilter[] {
    return this.userTagFilters;
  }

  /** The query-string parameters for this query, e.g. `{ 'filters.legalLastName.equals': 'Adams' }`. */
  getQueryOptions(): QueryParams {
    const params: QueryParams = {};

    for (const { propertyName, operator, value } of this.propertyFilters) {
      let v: QueryParams[string];
      if (value instanceof ModelBase) {
        const url = value.getResourceUrl();
        if (!url) throw new QueryError('Model used in filters must be connected and have a resource URL set');
        v = url;
      } else if (value instanceof Date) {
        v = formatArborDate(value);
      } else if (value === null) {
        v = 'NULL';
      } else {
        v = value;
      }
      params[`filters.${propertyName}.${operator}`] = v;
    }

    for (const { tagName, value } of this.userTagFilters) {
      params[`filters.tags.${tagName}`] = value instanceof Date ? formatArborDate(value) : value;
    }

    if (this.pageNumber !== null) params['page-number'] = this.pageNumber;
    if (this.pageSize !== null) params['page-size'] = this.pageSize;
    if (this.orderProperty !== null) params['order-property'] = this.orderProperty;

    // The API takes a single `filters.self.tagged` value; like the PHP SDK, the last tagging wins.
    for (const tag of this.taggings) params['filters.self.tagged'] = tag;

    return params;
  }
}
