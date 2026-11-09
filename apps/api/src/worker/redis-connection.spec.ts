import { redisConnection } from './redis-connection';

describe('redisConnection', () => {
  it('parses host, port, credentials and db', () => {
    expect(redisConnection('redis://user:p%40ss@redis:6380/2')).toMatchObject({
      host: 'redis',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      tls: undefined,
      maxRetriesPerRequest: null,
    });
  });

  it('defaults the port and enables TLS for rediss://', () => {
    expect(redisConnection('rediss://cache.example.com')).toMatchObject({
      host: 'cache.example.com',
      port: 6379,
      db: undefined,
      tls: {},
    });
  });
});
