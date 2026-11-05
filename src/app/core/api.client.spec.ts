import { TestBed } from '@angular/core/testing';
import { ApiClient, ApiError, FETCH } from './api.client';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let api: ApiClient;

  beforeEach(() => {
    fetchFn = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: FETCH, useValue: fetchFn }] });
    api = TestBed.inject(ApiClient);
  });

  it('prefixes /api and sends JSON bodies', async () => {
    fetchFn.mockResolvedValueOnce(json({ id: 'x' }, 201));
    await expect(api.post('/items', { name: 'Peas' })).resolves.toEqual({ id: 'x' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/items');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Peas"}');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('returns undefined for 204', async () => {
    fetchFn.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.delete('/items/x')).resolves.toBeUndefined();
  });

  it('throws ApiError with the server error code', async () => {
    fetchFn.mockResolvedValueOnce(json({ error: { code: 'not_found', message: 'Item not found' } }, 404));
    await expect(api.get('/items/x')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Item not found',
    });
  });

  it('throws an internal ApiError when the error body is not JSON', async () => {
    fetchFn.mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }));
    const err = await api.get('/inventory').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'internal' });
  });

  it('throws a network ApiError when fetch fails', async () => {
    fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/inventory')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
