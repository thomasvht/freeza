import { inject, Injectable, InjectionToken } from '@angular/core';
import type { ApiErrorCode } from '@shared/api-types';
import { ConnectivityService } from './connectivity.service';
import { SessionService } from './session.service';

/** The `fetch` the API client uses; replaced in tests. */
export const FETCH = new InjectionToken<typeof fetch>('FETCH', {
  providedIn: 'root',
  factory: () => globalThis.fetch.bind(globalThis),
});

export type ApiErrorKind = ApiErrorCode | 'network' | 'session_expired';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api';

/** Thin JSON client for the Worker API. Paths are relative to `/api`. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly fetchFn = inject(FETCH);
  private readonly connectivity = inject(ConnectivityService);
  private readonly session = inject(SessionService);

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    // `manual`: an Access redirect to its login page must surface as `opaqueredirect`, not be followed.
    const init: RequestInit = { method, headers, credentials: 'same-origin', redirect: 'manual' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchFn(BASE + path, init);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error';
      // A blocked cross-origin redirect to Access's login fails as a TypeError while the device is online.
      if (e instanceof TypeError && this.connectivity.isOnline()) throw this.sessionExpired(message);
      throw new ApiError(0, 'network', message);
    }

    if (res.type === 'opaqueredirect' || res.redirected) throw this.sessionExpired('Session expired');
    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private sessionExpired(message: string): ApiError {
    this.session.markExpired();
    return new ApiError(0, 'session_expired', message);
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    if (body.error?.code) {
      return new ApiError(res.status, body.error.code as ApiErrorCode, body.error.message ?? '');
    }
  } catch {
    // Not a JSON error body (e.g. a proxy error page): fall through.
  }
  return new ApiError(res.status, 'internal', res.statusText || `HTTP ${res.status}`);
}
