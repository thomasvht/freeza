import { TestBed } from '@angular/core/testing';
import { ApiClient, ApiError, FETCH } from './api.client';
import { ONLINE_PROBE } from './connectivity.service';
import { SessionService } from './session.service';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let api: ApiClient;
  let onLine: boolean;

  beforeEach(() => {
    fetchFn = vi.fn();
    onLine = true;
    TestBed.configureTestingModule({
      providers: [
        { provide: FETCH, useValue: fetchFn },
        { provide: ONLINE_PROBE, useValue: () => onLine },
      ],
    });
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

  it('throws a network ApiError when fetch fails while offline', async () => {
    onLine = false;
    fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.get('/inventory')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  describe('session expiry and offline', () => {
    const opaque = (props: { type?: ResponseType; redirected?: boolean }) => {
      const res = new Response(null, { status: 200 });
      for (const [key, value] of Object.entries(props)) Object.defineProperty(res, key, { value });
      return res;
    };

    it('does not follow redirects on /api requests', async () => {
      fetchFn.mockResolvedValueOnce(json({}));
      await api.get('/inventory');
      expect(fetchFn.mock.calls[0][1].redirect).toBe('manual');
    });

    it('throws session_expired for an opaqueredirect response', async () => {
      fetchFn.mockResolvedValueOnce(opaque({ type: 'opaqueredirect' }));
      await expect(api.get('/inventory')).rejects.toMatchObject({ code: 'session_expired' });
    });

    it('throws session_expired for a redirected response', async () => {
      fetchFn.mockResolvedValueOnce(opaque({ redirected: true }));
      await expect(api.get('/inventory')).rejects.toMatchObject({ code: 'session_expired' });
    });

    it('throws session_expired for a fetch TypeError while online', async () => {
      fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(api.get('/inventory')).rejects.toMatchObject({ code: 'session_expired' });
    });

    it('throws network for a fetch TypeError while offline', async () => {
      onLine = false;
      fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const err = await api.get('/inventory').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toMatchObject({ code: 'network' });
      expect(TestBed.inject(SessionService).expired()).toBe(false);
    });

    it('flags the session as expired', async () => {
      fetchFn.mockResolvedValueOnce(opaque({ type: 'opaqueredirect' }));
      await api.get('/inventory').catch(() => undefined);
      expect(TestBed.inject(SessionService).expired()).toBe(true);
    });
  });
});
