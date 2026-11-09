import type { MailerService } from '../mail/mailer.service';
import type { PrismaService } from '../prisma/prisma.service';
import { DeadAlertService } from './dead-alert.service';

function setup(logCount: number) {
  const prisma = {
    mailLog: {
      findMany: vi.fn().mockResolvedValue(
        Array.from({ length: logCount }, (_, i) => ({
          queue: { id: `q${i}`, erpRefId: `PR:${i}`, lastError: '550 no such user' },
        })),
      ),
    },
    smtpConfig: { findFirst: vi.fn().mockResolvedValue({ id: 's1' }) },
    adminUser: {
      findMany: vi.fn().mockResolvedValue([{ email: 'a@x.com' }, { email: 'b@x.com' }]),
    },
  };
  const mailer = { send: vi.fn().mockResolvedValue({}) };
  const service = new DeadAlertService(
    prisma as unknown as PrismaService,
    mailer as unknown as MailerService,
  );
  return { prisma, mailer, service };
}

describe('DeadAlertService', () => {
  it('does nothing when no mail died', async () => {
    const { mailer, service } = setup(0);
    await expect(service.notify(new Date(0), new Date())).resolves.toBe(0);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('emails all active admins a capped summary', async () => {
    const { mailer, service } = setup(25);
    await expect(service.notify(new Date(0), new Date())).resolves.toBe(25);
    const message = mailer.send.mock.calls[0][1];
    expect(message.to).toEqual(['a@x.com', 'b@x.com']);
    expect(message.subject).toContain('25');
    expect(message.text).toContain('- PR:0: 550 no such user');
    expect(message.text).toContain('อีก 5 รายการ');
  });
});
