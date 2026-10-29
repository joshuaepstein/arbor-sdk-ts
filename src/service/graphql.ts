import { ArborError, ServerError } from '../errors.js';
import { HttpMethod, type HttpClientInterface } from '../api/http-client.js';
import { formatArborDate } from '../util/date.js';

/** Arbor's GraphQL endpoint (same host and credentials as `/rest-v2`). */
export const GRAPHQL_PATH = '/graphql/query';

/**
 * Arbor caps an unpaged GraphQL list at 3000 rows and says nothing. `graphqlAll()`
 * pages instead; 5000 rows a page is accepted and fast.
 */
export const GRAPHQL_DEFAULT_PAGE_SIZE = 5000;

export interface GraphQLErrorEntry {
  message: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  /** e.g. `{ category: 'authorization' }` or `{ category: 'graphql' }`. */
  extensions?: { category?: string; [key: string]: unknown };
}

/** Arbor returned GraphQL `errors` (bad query, or a field or type the API user can't read). */
export class GraphQLError extends ArborError {
  readonly errors: GraphQLErrorEntry[];
  /** Any `data` that came back alongside the errors. */
  readonly data: unknown;

  constructor(errors: GraphQLErrorEntry[], data: unknown = null) {
    const first = errors[0]?.message ?? 'GraphQL request failed';
    super(errors.length > 1 ? `${first} (+${errors.length - 1} more)` : first);
    this.errors = errors;
    this.data = data;
  }

  /** True when every error is a permission error (the API user can't read something). */
  get isForbidden(): boolean {
    return this.errors.length > 0 && this.errors.every((e) => e.extensions?.category === 'authorization');
  }
}

/** A filter value: `Date`s are sent as Arbor date strings. */
export type GraphQLArgValue = string | number | boolean | null | Date | readonly (string | number)[];

/**
 * Filter arguments for one GraphQL list, e.g.
 * `{ startDatetime_after: monday, startDatetime_before: saturday, student__id: 4987 }`.
 * Date filters take `_after` / `_before` (Arbor rejects `from` / `to`).
 */
export type GraphQLArgs = Record<string, GraphQLArgValue | undefined>;

export interface GraphQLAllOptions {
  filter?: GraphQLArgs;
  /** Rows per request. Default 5000. */
  pageSize?: number;
  /** Safety stop. Default 1000 pages. */
  maxPages?: number;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function literal(value: GraphQLArgValue): string {
  if (value === null) return 'null';
  if (value instanceof Date) return JSON.stringify(formatArborDate(value));
  if (Array.isArray(value)) return `[${value.map((v) => literal(v)).join(', ')}]`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ArborError(`GraphQL argument is not a finite number: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}

/** Formats filter arguments as GraphQL source: `a: "x", b: 2`. Undefined values are skipped. */
export function formatGraphQLArgs(args: GraphQLArgs = {}): string {
  return Object.entries(args)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      if (!NAME.test(k)) throw new ArborError(`Invalid GraphQL argument name: ${k}`);
      return `${k}: ${literal(v as GraphQLArgValue)}`;
    })
    .join(', ');
}

/** Runs a GraphQL query and returns its `data`. Throws `GraphQLError` if Arbor reports errors. */
export async function runGraphQL<T = Record<string, any>>(
  http: HttpClientInterface,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let payload: Record<string, any>;
  try {
    payload = await http.sendRequest(HttpMethod.POST, GRAPHQL_PATH, {
      body: variables ? { query, variables } : { query },
    });
  } catch (e) {
    // Error statuses can still carry a GraphQL body; surface its messages.
    const body = e instanceof ServerError ? (e.responsePayload as Record<string, any> | null) : null;
    if (body && Array.isArray(body.errors) && body.errors.length) throw new GraphQLError(body.errors, body.data ?? null);
    throw e;
  }
  if (Array.isArray(payload.errors) && payload.errors.length) throw new GraphQLError(payload.errors, payload.data ?? null);
  return (payload.data ?? {}) as T;
}

/**
 * Every row of one type, paging until a short page. Pages are numbered from 0.
 *
 * ```ts
 * const enrolments = await graphqlAll(http, 'AcademicUnitEnrolment',
 *   'id student { id } academicUnit { id }', { filter: { endDate_after: new Date() } });
 * ```
 */
export async function runGraphQLAll<T = Record<string, any>>(
  http: HttpClientInterface,
  type: string,
  fields: string,
  options: GraphQLAllOptions = {},
): Promise<T[]> {
  if (!NAME.test(type)) throw new ArborError(`Invalid GraphQL type name: ${type}`);
  const pageSize = options.pageSize ?? GRAPHQL_DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? 1000;
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new ArborError(`pageSize must be a positive integer`);
  const filter = formatGraphQLArgs(options.filter);
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const args = `${filter ? `${filter}, ` : ''}page_num: ${page}, page_size: ${pageSize}`;
    const data = await runGraphQL<Record<string, T[] | null>>(http, `{ ${type} (${args}) { ${fields} } }`);
    const batch = data[type] ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  throw new ArborError(`${type}: stopped after ${maxPages} pages of ${pageSize}; raise maxPages if this is expected`);
}
