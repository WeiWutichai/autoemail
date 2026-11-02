import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ email: z.string().trim().email() }));

  it('returns parsed data', () => {
    expect(pipe.transform({ email: ' a@b.co ' })).toEqual({ email: 'a@b.co' });
  });

  it('throws VALIDATION_ERROR with issue paths', () => {
    try {
      pipe.transform({ email: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'email' }],
      });
    }
  });
});
