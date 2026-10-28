import { ResourceNotFoundError, ServerError } from '../errors.js';
import type { QueryParams } from '../query/query.js';
import type { UploadFile } from './upload-file.js';

export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

/** JSON object returned by the API. */
export type ApiResponse = Record<string, any>;

export interface RequestOptions {
  /** JSON body. */
  body?: unknown;
  /** Query-string parameters. */
  query?: QueryParams;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  /** e.g. `https://api-sandbox2.uk.arbor.sc`. A trailing `/rest-v2` is tolerated. */
  baseUrl: string;
  user?: string;
  password?: string;
  userAgent?: string;
  applicationId?: string | null;
  /** Custom `fetch` (defaults to the global one). */
  fetch?: FetchLike;
  /** Abort each request after this many milliseconds. */
  timeoutMs?: number;
}

export interface HttpClientInterface {
  getApplicationId(): string | null;
  setApplicationId(applicationId: string | null): void;
  sendRequest(method: HttpMethod, url: string, options?: RequestOptions): Promise<ApiResponse>;
  uploadRequest(url: string, file: UploadFile, options?: RequestOptions): Promise<ApiResponse>;
  fetchRaw(url: string, options?: RequestOptions & { method?: HttpMethod }): Promise<Response>;
}

const VALID_STATUSES = new Set([200, 201, 204, 422]);

/** Encodes params like PHP's `http_build_query` (arrays → `key[0]=…`, booleans → `1`/`0`). */
export function buildQueryString(params: QueryParams): string {
  const parts: string[] = [];
  const add = (key: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
      return;
    }
    const str = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(str)}`);
  };
  for (const [key, value] of Object.entries(params)) add(key, value);
  return parts.join('&');
}

function base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Sends authenticated JSON requests to the Arbor REST API (PHP: `Arbor\Api\Gateway\HttpClient\HttpClient`). */
export class HttpClient implements HttpClientInterface {
  protected baseUrl = '';
  protected authUser: string;
  protected authPassword: string;
  protected userAgent: string;
  protected applicationId: string | null;
  protected timeoutMs: number | undefined;
  protected readonly fetchFn: FetchLike;

  constructor(options: HttpClientOptions) {
    this.setBaseUrl(options.baseUrl);
    this.authUser = options.user ?? '';
    this.authPassword = options.password ?? '';
    this.userAgent = options.userAgent ?? 'Arbor TypeScript SDK';
    this.applicationId = options.applicationId || null;
    this.timeoutMs = options.timeoutMs;
    if (!options.fetch && typeof globalThis.fetch !== 'function') {
      throw new TypeError('No fetch implementation found. Use Node 18+ or pass `fetch` in the options.');
    }
    this.fetchFn = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  getApplicationId(): string | null {
    return this.applicationId;
  }
  setApplicationId(applicationId: string | null): void {
    this.applicationId = applicationId || null;
  }
  getUserAgent(): string {
    return this.userAgent;
  }
  setUserAgent(userAgent: string): this {
    this.userAgent = userAgent;
    return this;
  }
  getAuthUser(): string {
    return this.authUser;
  }
  setAuthUser(user: string): this {
    this.authUser = user;
    return this;
  }
  getAuthPassword(): string {
    return this.authPassword;
  }
  setAuthPassword(password: string): this {
    this.authPassword = password;
    return this;
  }
  getBaseUrl(): string {
    return this.baseUrl;
  }
  setBaseUrl(baseUrl: string): this {
    // Request paths already start with /rest-v2, so drop it (and trailing slashes) from the base.
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/rest-v2$/, '');
    return this;
  }

  async sendRequest(method: HttpMethod, url: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const headers = this.buildHeaders(options);
    let body: string | undefined;
    let requestPayload: unknown = null;
    if (options.body !== undefined && options.body !== null) {
      requestPayload = options.body;
      body = JSON.stringify(options.body);
      headers['Content-Type'] ??= 'application/json';
    }
    return this.execute(method, this.buildUrl(url, options.query), { headers, body, signal: options.signal }, requestPayload);
  }

  async uploadRequest(url: string, file: UploadFile, options: RequestOptions = {}): Promise<ApiResponse> {
    const form = new FormData();
    const blob = file.toBlob();
    if (file.filename !== null) form.append(file.name, blob, file.filename);
    else form.append(file.name, blob);
    // fetch sets the multipart Content-Type (with boundary) itself.
    return this.execute(
      HttpMethod.POST,
      this.buildUrl(url, options.query),
      { headers: this.buildHeaders(options), body: form, signal: options.signal },
      '[multipart data]',
    );
  }

  /**
   * Sends an authenticated request and returns the raw `Response` without
   * parsing or error mapping. Use it for binary downloads (files, images).
   */
  fetchRaw(url: string, options: RequestOptions & { method?: HttpMethod } = {}): Promise<Response> {
    const headers = this.buildHeaders({ ...options, headers: { Accept: '*/*', ...options.headers } });
    let signal = options.signal;
    if (this.timeoutMs !== undefined) signal ??= AbortSignal.timeout(this.timeoutMs);
    return this.fetchFn(this.buildUrl(url, options.query), { method: options.method ?? HttpMethod.GET, headers, signal });
  }

  protected buildUrl(url: string, query?: QueryParams): string {
    let full = /^https?:\/\//i.test(url) ? url : `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    if (query) {
      const qs = buildQueryString(query);
      if (qs) full += (full.includes('?') ? '&' : '?') + qs;
    }
    return full;
  }

  protected buildHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    headers['User-Agent'] ??= this.userAgent;
    if (this.applicationId) headers['x-mis-application-id'] = this.applicationId;
    if (this.authUser || this.authPassword) {
      headers.Authorization = `Basic ${base64(`${this.authUser}:${this.authPassword}`)}`;
    }
    return headers;
  }

  protected async execute(
    method: HttpMethod,
    url: string,
    init: { headers: Record<string, string>; body?: BodyInit; signal?: AbortSignal },
    requestPayload: unknown,
  ): Promise<ApiResponse> {
    let signal = init.signal;
    if (this.timeoutMs !== undefined) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      signal = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
    }

    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(url, { method, headers: init.headers, body: init.body, signal });
      text = await response.text();
    } catch (e) {
      throw new ServerError(`An unexpected error has occurred: ${(e as Error)?.message ?? String(e)}`, {
        cause: e,
        requestPayload,
      });
    }

    let payload: ApiResponse | null = null;
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) payload = parsed as ApiResponse;
      } catch {
        payload = null;
      }
    }

    let code = response.status;
    if (payload === null && !VALID_STATUSES.has(code)) {
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 200);
      const hint =
        code === 401
          ? ' Authentication failed: check the API user and password (Basic auth) and that they are valid for this host.'
          : code === 403
            ? ' Access denied: the credentials are valid but lack permission for this resource.'
            : '';
      throw new ServerError(
        `Server responded with HTTP ${code} and a non-JSON body${snippet ? `: "${snippet}"` : ''}.${hint}`,
        { status: code, requestPayload, responsePayload: text || null },
      );
    }

    // Arbor uses several error shapes: { response: {code, reason, errors} },
    // { status: {code, reason, errors} } and { success: false, message }.
    const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
    const meta = isObj(payload?.response) ? payload.response : isObj(payload?.status) ? payload.status : undefined;
    if (meta && meta.code !== undefined && meta.code !== null) code = Number(meta.code);

    let message: string = meta?.reason ?? (typeof payload?.message === 'string' ? payload.message : 'API Error');
    let serverExceptionClass: string | null = null;
    let serverExceptionMessage: string | null = null;
    let serverExceptionTrace: string | null = null;

    const errors: unknown[] = Array.isArray(meta?.errors) ? meta.errors : [];
    const firstError = errors[0];
    const textErrors = errors.filter((e): e is string => typeof e === 'string');
    if (textErrors.length) message = `${message}: ${textErrors.join('; ')}`;
    if (isObj(firstError)) {
      serverExceptionClass = firstError.exception ?? null;
      serverExceptionMessage = firstError.message ?? null;
      serverExceptionTrace = firstError.trace ?? null;
      message = `Server threw: ${serverExceptionClass} with message: ${serverExceptionMessage} URL=${url}`;
    }

    if (VALID_STATUSES.has(code)) return payload ?? {};
    if (code === 404) throw new ResourceNotFoundError(message || 'Not Found');
    throw new ServerError(message, {
      status: code,
      requestPayload,
      responsePayload: payload,
      serverExceptionClass,
      serverExceptionMessage,
      serverExceptionTrace,
    });
  }
}
