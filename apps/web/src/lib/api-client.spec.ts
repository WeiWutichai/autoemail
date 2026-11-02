import { ApiClientError, createApiClient } from './api-client';

const json = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const session = (token: string) => ({
  accessToken: token,
  user: {
    id: 'u',
    email: 'a@b.co',
    name: 'A',
    isActive: true,
    lastLoginAt: null,
    createdAt: '',
    updatedAt: '',
  },
});

function setup(responses: Response[]) {
  const fetchFn = vi.fn<typeof fetch>();
  responses.forEach((r) => fetchFn.mockResolvedValueOnce(r));
  const onUnauthorized = vi.fn();
  const client = createApiClient({ baseUrl: '/api', fetchFn, onUnauthorized });
  const authHeader = (call: number) =>
    new Headers(fetchFn.mock.calls[call][1]?.headers).get('Authorization');
  return { client, fetchFn, onUnauthorized, authHeader };
}

describe('api client', () => {
  it('attaches the access token after login', async () => {
    const { client, authHeader } = setup([json(200, session('t1')), json(200, [])]);

    await client.login({ email: 'a@b.co', password: 'x' });
    await client.request('/admin-users');

    expect(authHeader(1)).toBe('Bearer t1');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { client, fetchFn, authHeader } = setup([
      json(200, session('old')),
      json(401, { code: 'INVALID_SESSION', message: 'x' }),
      json(200, session('new')),
      json(200, { ok: true }),
    ]);

    await client.login({ email: 'a@b.co', password: 'x' });
    await expect(client.request('/admin-users')).resolves.toEqual({ ok: true });

    expect(fetchFn.mock.calls[2][0]).toBe('/api/auth/refresh');
    expect(authHeader(3)).toBe('Bearer new');
  });

  it('calls onUnauthorized and throws when refresh fails', async () => {
    const { client, onUnauthorized } = setup([
      json(401, { code: 'UNAUTHORIZED', message: 'Missing access token' }),
      json(401, { code: 'INVALID_SESSION', message: 'x' }),
    ]);

    await expect(client.request('/admin-users')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not retry more than once', async () => {
    const { client, fetchFn } = setup([
      json(401, { code: 'UNAUTHORIZED', message: 'x' }),
      json(200, session('new')),
      json(401, { code: 'UNAUTHORIZED', message: 'x' }),
    ]);

    await expect(client.request('/x')).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('shares one refresh between concurrent requests', async () => {
    const { client, fetchFn } = setup([
      json(401, {}),
      json(401, {}),
      json(200, session('new')),
      json(200, 1),
      json(200, 2),
    ]);

    await Promise.all([client.request('/a'), client.request('/b')]);

    const refreshCalls = fetchFn.mock.calls.filter(([url]) => url === '/api/auth/refresh');
    expect(refreshCalls).toHaveLength(1);
  });

  it('maps API error bodies and handles 204', async () => {
    const { client } = setup([
      json(409, { code: 'EMAIL_TAKEN', message: 'Email is already in use' }),
      new Response(null, { status: 204 }),
    ]);

    await expect(
      client.request('/admin-users', { method: 'POST', json: {} }),
    ).rejects.toMatchObject({ status: 409, code: 'EMAIL_TAKEN' });
    await expect(client.request('/x', { method: 'POST' })).resolves.toBeUndefined();
  });
});
