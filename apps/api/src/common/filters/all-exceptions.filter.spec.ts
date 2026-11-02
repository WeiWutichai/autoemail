import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('keeps custom code, message and details', () => {
    const err = new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: [1],
    });
    expect(filter.toApiError(err)).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Invalid', details: [1] },
    });
  });

  it('derives code from status for plain Nest exceptions', () => {
    expect(filter.toApiError(new NotFoundException('Missing')).body).toEqual({
      code: 'NOT_FOUND',
      message: 'Missing',
    });
    expect(filter.toApiError(new UnauthorizedException()).body.code).toBe('UNAUTHORIZED');
  });

  it('hides details of unknown errors', () => {
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    expect(filter.toApiError(new Error('db password leaked'))).toEqual({
      status: 500,
      body: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
});
