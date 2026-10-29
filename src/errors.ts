/** Base class for every error thrown by the SDK (PHP: `Arbor\Exception`). */
export class ArborError extends Error {
  constructor(message = '', options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Errors raised by models and the hydrator (PHP: `Arbor\Model\Exception`). */
export class ModelError extends ArborError {}

/** Errors raised while building or running queries (PHP: `Arbor\Query\Exception`). */
export class QueryError extends ArborError {}

/** Errors raised by the gateway (PHP: `Arbor\Api\Gateway\Exception`). */
export class GatewayError extends ArborError {}

export interface ServerErrorDetails {
  cause?: unknown;
  /** HTTP (or API-reported) status code, when known. */
  status?: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  serverExceptionClass?: string | null;
  serverExceptionMessage?: string | null;
  serverExceptionTrace?: string | null;
}

/** The API returned an error, or the request failed (PHP: `ServerErrorException`). */
export class ServerError extends ArborError {
  readonly status?: number;
  readonly requestPayload: unknown;
  readonly responsePayload: unknown;
  serverExceptionClass: string | null;
  serverExceptionMessage: string | null;
  serverExceptionTrace: string | null;

  constructor(message = '', details: ServerErrorDetails = {}) {
    super(message, details.cause !== undefined ? { cause: details.cause } : undefined);
    this.status = details.status;
    this.requestPayload = details.requestPayload ?? null;
    this.responsePayload = details.responsePayload ?? null;
    this.serverExceptionClass = details.serverExceptionClass ?? null;
    this.serverExceptionMessage = details.serverExceptionMessage ?? null;
    this.serverExceptionTrace = details.serverExceptionTrace ?? null;
  }
}

/** The API responded with 404 (PHP: `ResourceNotFoundException`). */
export class ResourceNotFoundError extends ArborError {
  /** Always 404, matching `ServerError.status`. */
  readonly status = 404;
}

/** The API rejected the payload (PHP: `ServerValidationException`). */
export class ServerValidationError extends ArborError {
  /** Always 422, matching `ServerError.status`. */
  readonly status = 422;

  constructor(
    message = '',
    readonly validationErrors: unknown = [],
  ) {
    super(message);
  }

  override toString(): string {
    return `${super.toString()}\n${JSON.stringify(this.validationErrors, null, 2)}`;
  }
}
