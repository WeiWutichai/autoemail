import { emptyMailFilters, mailQueryString } from './mails';

describe('mailQueryString', () => {
  it('omits empty filters', () => {
    expect(mailQueryString(emptyMailFilters)).toBe('page=1&pageSize=25');
  });

  it('turns local day inputs into an inclusive range', () => {
    const qs = new URLSearchParams(
      mailQueryString({
        ...emptyMailFilters,
        status: 'DEAD',
        from: '2026-11-01',
        to: '2026-11-09',
      }),
    );
    expect(qs.get('status')).toBe('DEAD');
    expect(new Date(qs.get('from') as string).getDate()).toBe(1);
    const to = new Date(qs.get('to') as string);
    expect(to.getDate()).toBe(10);
    expect(to.getHours()).toBe(0);
  });
});
