import type { PrismaService } from '../prisma/prisma.service';
import { ERASED_ADDRESS, PrivacyService } from './privacy.service';

function setup() {
  const prisma = {
    contact: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    mailQueue: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'q1', status: 'SENT', toAddrs: ['a@x.com', 'b@x.com'], cc: [], bcc: [] },
        { id: 'q2', status: 'PENDING', toAddrs: ['b@x.com'], cc: ['a@x.com'], bcc: [] },
      ]),
      update: vi.fn((args: { data: Record<string, unknown> }) => args),
      updateMany: vi.fn().mockResolvedValue({ count: 4 }),
    },
    mailLog: { updateMany: vi.fn((args: unknown) => args) },
    $transaction: vi.fn((ops: unknown[]) => Promise.resolve(ops)),
  };
  return { prisma, service: new PrivacyService(prisma as unknown as PrismaService) };
}

describe('PrivacyService', () => {
  it('erases contacts and mail content for an address, cancelling unsent mails', async () => {
    const { prisma, service } = setup();
    await expect(service.erase('A@X.com')).resolves.toEqual({
      contactsDeleted: 2,
      mailsScrubbed: 2,
    });
    expect(prisma.contact.deleteMany).toHaveBeenCalledWith({ where: { email: 'a@x.com' } });

    const sent = prisma.mailQueue.update.mock.calls[0][0].data;
    expect(sent).toMatchObject({
      toAddrs: [ERASED_ADDRESS, 'b@x.com'],
      renderedHtml: null,
      renderedSubject: null,
    });
    expect(sent).not.toHaveProperty('status');

    const pending = prisma.mailQueue.update.mock.calls[1][0].data;
    expect(pending).toMatchObject({ cc: [ERASED_ADDRESS], status: 'CANCELLED' });
    expect(prisma.mailLog.updateMany).toHaveBeenCalledWith({
      where: { queueId: 'q1' },
      data: { smtpResponse: null },
    });
  });

  it('purges content of finished mails older than the retention period', async () => {
    const { prisma, service } = setup();
    const now = new Date('2026-11-09T00:00:00Z');
    await expect(service.purgeOldContent(90, now)).resolves.toBe(4);
    const where = prisma.mailQueue.updateMany.mock.calls[0][0].where;
    expect(where.createdAt.lt.toISOString()).toBe('2026-08-11T00:00:00.000Z');
    expect(where.status).toEqual({ in: ['SENT', 'DEAD', 'CANCELLED'] });
  });
});
