import { pdpaEraseInputSchema } from './audit';
import { mailListQuerySchema } from './mails';

describe('mailListQuerySchema', () => {
  it('drops empty filters and coerces dates', () => {
    const parsed = mailListQuerySchema.parse({
      status: '',
      from: '2026-11-01',
      q: ' buyer@example.com ',
      page: '1',
    });
    expect(parsed.status).toBeUndefined();
    expect(parsed.from).toEqual(new Date('2026-11-01'));
    expect(parsed.q).toBe('buyer@example.com');
  });

  it('rejects unknown statuses', () => {
    expect(mailListQuerySchema.safeParse({ status: 'LOST' }).success).toBe(false);
  });
});

describe('pdpaEraseInputSchema', () => {
  it('normalizes the address', () => {
    expect(pdpaEraseInputSchema.parse({ email: ' Buyer@Example.com ' }).email).toBe(
      'buyer@example.com',
    );
  });
});
