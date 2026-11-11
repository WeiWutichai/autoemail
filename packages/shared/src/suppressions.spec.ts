import { createSuppressionSchema, MAX_SUPPRESSION_REASON_LENGTH } from './suppressions';

describe('createSuppressionSchema', () => {
  it('normalises the address and blank reasons', () => {
    expect(createSuppressionSchema.parse({ email: '  A@X.com ' })).toEqual({
      email: 'a@x.com',
      reason: null,
    });
    expect(createSuppressionSchema.parse({ email: 'a@x.com', reason: '  ' }).reason).toBeNull();
    expect(createSuppressionSchema.parse({ email: 'a@x.com', reason: ' left ' }).reason).toBe(
      'left',
    );
  });

  it('rejects invalid addresses and long reasons', () => {
    expect(createSuppressionSchema.safeParse({ email: 'nope' }).success).toBe(false);
    expect(
      createSuppressionSchema.safeParse({
        email: 'a@x.com',
        reason: 'x'.repeat(MAX_SUPPRESSION_REASON_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
