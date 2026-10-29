import { afterEach, describe, expect, it } from 'vitest';
import { ArborError, GraphQLError, ModelBase, formatGraphQLArgs } from '../src/index.js';
import { setup } from './helpers.js';

afterEach(() => ModelBase.setDefaultGateway(null));

describe('graphql()', () => {
  it('posts the query to /graphql/query with auth and returns data', async () => {
    const { api, calls } = setup({ json: { data: { Room: [{ id: 1, displayName: 'M105' }] } } });
    const data = await api.graphql<{ Room: { id: number; displayName: string }[] }>('{ Room { id displayName } }', { a: 1 });
    expect(data.Room).toEqual([{ id: 1, displayName: 'M105' }]);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://school.example/graphql/query');
    expect(calls[0]!.headers.Authorization).toMatch(/^Basic /);
    expect(calls[0]!.body).toEqual({ query: '{ Room { id displayName } }', variables: { a: 1 } });
  });

  it('throws GraphQLError for reported errors and flags permission errors', async () => {
    const { api } = setup({
      json: {
        data: null,
        errors: [{ message: 'You do not have access to `AcademicHoliday`.', extensions: { category: 'authorization' } }],
      },
    });
    const err = await api.graphql('{ AcademicHoliday { id } }').catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err).toBeInstanceOf(ArborError);
    expect(err.isForbidden).toBe(true);
    expect(err.message).toContain('AcademicHoliday');
  });

  it('reports query mistakes as not-forbidden', async () => {
    const { api } = setup({ json: { errors: [{ message: 'Cannot query field "x"', extensions: { category: 'graphql' } }] } });
    const err = await api.graphql('{ Room { x } }').catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.isForbidden).toBe(false);
  });

  it('reads GraphQL errors from an error status too', async () => {
    const { api } = setup({ status: 500, json: { errors: [{ message: 'Internal server error', extensions: { category: 'internal' } }] } });
    const err = await api.graphql('{ __type(name: "Query") { name } }').catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.message).toBe('Internal server error');
  });
});

describe('graphqlAll()', () => {
  it('pages from 0 until a short page, so the 3000-row cap never truncates', async () => {
    const page = (n: number, from: number) => ({ json: { data: { Session: Array.from({ length: n }, (_, i) => ({ id: from + i })) } } });
    const { api, calls } = setup(page(2, 0), page(2, 2), page(1, 4));
    const rows = await api.graphqlAll('Session', 'id', {
      pageSize: 2,
      filter: { startDatetime_after: new Date(2026, 10, 2, 0, 0, 0), academicUnit__id: 7, location: undefined },
    });
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
    const queries = calls.map((c) => (c.body as { query: string }).query);
    expect(queries[0]).toBe('{ Session (startDatetime_after: "2026-11-02 00:00:00", academicUnit__id: 7, page_num: 0, page_size: 2) { id } }');
    expect(queries[2]).toContain('page_num: 2');
  });

  it('stops after maxPages instead of looping forever', async () => {
    const full = { json: { data: { Room: [{ id: 1 }] } } };
    const { api } = setup(full, full);
    await expect(api.graphqlAll('Room', 'id', { pageSize: 1, maxPages: 2 })).rejects.toThrow(/stopped after 2 pages/);
  });

  it('treats a null list as empty', async () => {
    const { api } = setup({ json: { data: { Trip: null } } });
    expect(await api.graphqlAll('Trip', 'id')).toEqual([]);
  });
});

describe('formatGraphQLArgs()', () => {
  it('formats strings, numbers, booleans, null, dates and lists', () => {
    expect(
      formatGraphQLArgs({ a: 'x "y"', b: 2, c: true, d: null, e: new Date(2026, 0, 5, 9, 30, 0), f: [1, 'z'], g: undefined }),
    ).toBe('a: "x \\"y\\"", b: 2, c: true, d: null, e: "2026-01-05 09:30:00", f: [1, "z"]');
  });

  it('rejects names that could inject query text', () => {
    expect(() => formatGraphQLArgs({ 'a) { id } x(': 1 })).toThrow(/Invalid GraphQL argument name/);
  });
});
