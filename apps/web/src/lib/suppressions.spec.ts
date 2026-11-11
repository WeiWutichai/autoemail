import type { SuppressedEmailDto } from '@erp-mail/shared';
import { findSuppression } from './suppressions';

const entry = (id: string, connectionId: string | null): SuppressedEmailDto => ({
  id,
  email: 'a@x.com',
  connectionId,
  connectionName: connectionId ? 'db' : null,
  reason: null,
  createdAt: '2026-11-11T00:00:00.000Z',
});

describe('findSuppression', () => {
  it('prefers the entry of the database, then the every-database one', () => {
    const list = [entry('all', null), entry('c1', 'c1')];
    expect(findSuppression(list, 'A@x.com', 'c1')?.id).toBe('c1');
    expect(findSuppression(list, 'a@x.com', 'c2')?.id).toBe('all');
    expect(findSuppression(list, 'a@x.com', null)?.id).toBe('all');
  });

  it('ignores entries for other databases and unknown addresses', () => {
    const list = [entry('c1', 'c1')];
    expect(findSuppression(list, 'a@x.com', 'c2')).toBeUndefined();
    expect(findSuppression(list, 'a@x.com', null)).toBeUndefined();
    expect(findSuppression(list, 'b@x.com', 'c1')).toBeUndefined();
    expect(findSuppression(undefined, 'a@x.com', 'c1')).toBeUndefined();
  });
});
