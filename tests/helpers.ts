import { HttpClient, ModelBase, RestGateway, type FetchLike } from '../src/index.js';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Reply = { status?: number; json?: unknown; text?: string } | ((call: RecordedCall) => { status?: number; json?: unknown; text?: string });

/** A fetch stub that replays queued replies and records every request. */
export function mockFetch(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body = init.body;
    const call: RecordedCall = {
      url,
      method: String(init.method),
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof body === 'string' ? JSON.parse(body) : body,
    };
    calls.push(call);
    const next = replies.shift();
    if (!next) throw new Error(`Unexpected request: ${call.method} ${url}`);
    const r = typeof next === 'function' ? next(call) : next;
    const text = r.text ?? (r.json !== undefined ? JSON.stringify(r.json) : '');
    return new Response(text || null, { status: r.status ?? 200 });
  };
  return { fetch, calls };
}

export function setup(...replies: Reply[]) {
  const { fetch, calls } = mockFetch(...replies);
  const http = new HttpClient({ baseUrl: 'https://school.example/', user: 'u', password: 'p', fetch, maxRequestsPerSecond: Infinity });
  const api = new RestGateway(http);
  ModelBase.setDefaultGateway(api);
  return { api, http, calls };
}
