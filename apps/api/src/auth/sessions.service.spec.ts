import type { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  it('revokes only active sessions of the admin', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const service = new SessionsService({
      adminSession: { updateMany },
    } as unknown as PrismaService);

    await expect(service.revokeAllForAdmin('admin-1')).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: { adminId: 'admin-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
