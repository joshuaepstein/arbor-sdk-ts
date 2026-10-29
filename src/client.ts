import { RestGateway, type RestGatewayOptions } from './api/gateway.js';
import { HttpClient, type HttpClientOptions } from './api/http-client.js';
import { ModelBase } from './model/model-base.js';

export interface CreateClientOptions extends HttpClientOptions, RestGatewayOptions {
  /** Also make this the default gateway for `Model.retrieve()` / `Model.query()` / `save()`. Default `true`. */
  setAsDefault?: boolean;
}

/**
 * One-call setup: builds the HTTP client and gateway, and (by default) sets it
 * as the default gateway for every model.
 *
 * ```ts
 * const api = createClient({ baseUrl, user, password });
 * const student = await Student.retrieve(16);
 * ```
 */
export function createClient(options: CreateClientOptions): RestGateway {
  const { setAsDefault = true, hydrator, camelCaseToDash, pluralizeFilter, cacheTtlMs, ...http } = options;
  const gateway = new RestGateway(new HttpClient(http), { hydrator, camelCaseToDash, pluralizeFilter, cacheTtlMs });
  if (setAsDefault) ModelBase.setDefaultGateway(gateway);
  return gateway;
}
