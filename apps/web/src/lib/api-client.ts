import type { ApiError, LoginInput, LoginResponse } from '@erp-mail/shared';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown };

export interface ApiClientDeps {
  baseUrl: string;
  fetchFn: typeof fetch;
  /** Called when the session cannot be refreshed (e.g. redirect to /login). */
  onUnauthorized: () => void;
  /** Serializes refresh calls across browser tabs so a rotated token is never presented twice. */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>;
}

async function toError(res: Response): Promise<ApiClientError> {
  const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
  return new ApiClientError(
    res.status,
    body?.code ?? `HTTP_${res.status}`,
    body?.message ?? res.statusText,
    body?.details,
  );
}

export function createApiClient(deps: ApiClientDeps) {
  let session: LoginResponse | null = null;
  let refreshInFlight: Promise<LoginResponse | null> | null = null;
  const withLock = deps.withLock ?? (<T>(fn: () => Promise<T>) => fn());

  const post = (path: string, init: RequestInit = {}) =>
    deps.fetchFn(`${deps.baseUrl}${path}`, { method: 'POST', credentials: 'same-origin', ...init });

  async function doRefresh(): Promise<LoginResponse | null> {
    const res = await withLock(() => post('/auth/refresh'));
    session = res.ok ? ((await res.json()) as LoginResponse) : null;
    return session;
  }

  /** Single-flight refresh within this tab. */
  function refresh(): Promise<LoginResponse | null> {
    refreshInFlight ??= doRefresh().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function login(input: LoginInput): Promise<LoginResponse> {
    const res = await post('/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw await toError(res);
    }
    session = (await res.json()) as LoginResponse;
    return session;
  }

  async function logout(): Promise<void> {
    session = null;
    await post('/auth/logout').catch(() => undefined);
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const send = () => {
      const headers = new Headers(options.headers);
      if (session) {
        headers.set('Authorization', `Bearer ${session.accessToken}`);
      }
      if (options.json !== undefined) {
        headers.set('Content-Type', 'application/json');
      }
      const { json, ...init } = options;
      return deps.fetchFn(`${deps.baseUrl}${path}`, {
        ...init,
        headers,
        credentials: 'same-origin',
        body: json !== undefined ? JSON.stringify(json) : undefined,
      });
    };

    let res = await send();
    if (res.status === 401) {
      const refreshed = await refresh();
      if (!refreshed) {
        deps.onUnauthorized();
        throw await toError(res);
      }
      res = await send();
    }
    if (!res.ok) {
      throw await toError(res);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  return {
    login,
    logout,
    refresh,
    request,
    getSession: () => session,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function browserLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('erp-mail-auth-refresh', fn);
  }
  return fn();
}

export const api = createApiClient({
  baseUrl: '/api',
  fetchFn: (...args) => fetch(...args),
  withLock: browserLock,
  onUnauthorized: () => {
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  },
});
