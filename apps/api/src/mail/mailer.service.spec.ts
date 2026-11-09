import type { SmtpConfig } from '@prisma/client';
import type { CryptoService } from '../common/crypto/crypto.service';
import {
  classifySmtpError,
  MailerService,
  SmtpSendError,
  type TransportFactory,
} from './mailer.service';

const smtp: SmtpConfig = {
  id: 's1',
  name: 'Workspace',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  username: 'noreply@example.com',
  passwordEnc: 'enc:app-pass',
  fromName: 'ERP',
  fromEmail: 'noreply@example.com',
  dailyLimit: 2000,
  isDefault: true,
  lastTestAt: null,
  lastTestOk: null,
  createdAt: new Date('2026-11-09T00:00:00Z'),
  updatedAt: new Date('2026-11-09T00:00:00Z'),
};

function setup() {
  const transports: {
    sendMail: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const factory = vi.fn((_options: Record<string, unknown>) => {
    const t = {
      sendMail: vi.fn().mockResolvedValue({ messageId: '<m1@x>', response: '250 OK' }),
      verify: vi.fn().mockResolvedValue(true),
      close: vi.fn(),
    };
    transports.push(t);
    return t;
  });
  const crypto = { decrypt: (v: string) => v.replace('enc:', '') } as CryptoService;
  const mailer = new MailerService(crypto, factory as unknown as TransportFactory);
  return { mailer, factory, transports };
}

const mail = { to: ['a@x.com'], subject: 's', html: '<p>h</p>', text: 'h' };

describe('MailerService', () => {
  it('sends with the configured sender and reuses the pooled transport', async () => {
    const { mailer, factory, transports } = setup();
    await expect(mailer.send(smtp, mail)).resolves.toEqual({
      messageId: '<m1@x>',
      response: '250 OK',
    });
    await mailer.send(smtp, { ...mail, cc: [] });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory.mock.calls[0][0]).toMatchObject({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: 'noreply@example.com', pass: 'app-pass' },
      pool: true,
    });
    expect(transports[0].sendMail.mock.calls[0][0]).toMatchObject({
      from: { name: 'ERP', address: 'noreply@example.com' },
      to: ['a@x.com'],
      cc: undefined,
    });
  });

  it('rebuilds the transport when the config changes', async () => {
    const { mailer, factory, transports } = setup();
    await mailer.send(smtp, mail);
    await mailer.send({ ...smtp, updatedAt: new Date('2026-11-10T00:00:00Z') }, mail);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(transports[0].close).toHaveBeenCalled();
  });

  it('classifies and sanitizes send errors', async () => {
    const { mailer, transports } = setup();
    await mailer.send(smtp, mail);
    transports[0].sendMail.mockRejectedValueOnce({
      code: 'EENVELOPE',
      responseCode: 550,
      response: '550 5.1.1 The email account does not exist',
    });
    await expect(mailer.send(smtp, mail)).rejects.toMatchObject({
      permanent: true,
      responseCode: 550,
      message: '550 5.1.1 The email account does not exist',
    });
  });

  it('verifies with a throwaway transport and closes it', async () => {
    const { mailer, factory, transports } = setup();
    transports.length = 0;
    await mailer.verify(smtp);
    expect(factory.mock.calls[0][0]).not.toHaveProperty('pool');
    expect(transports[0].close).toHaveBeenCalled();
  });
});

describe('classifySmtpError', () => {
  it.each([
    [{ responseCode: 550, response: '550 no such user' }, true],
    [{ code: 'EAUTH', responseCode: 535, response: '535 bad credentials' }, false],
    [{ responseCode: 421, response: '421 try later' }, false],
    [{ code: 'ETIMEDOUT', message: 'Timeout' }, false],
    [{ code: 'ECONNECTION', message: 'connect ECONNREFUSED' }, false],
    [{ code: 'EENVELOPE', message: 'No recipients defined' }, true],
  ])('%j → permanent=%s', (err, permanent) => {
    const e = classifySmtpError(err);
    expect(e).toBeInstanceOf(SmtpSendError);
    expect(e.permanent).toBe(permanent);
  });

  it('removes the password from the message', () => {
    expect(classifySmtpError(new Error('auth app-pass rejected'), 'app-pass').message).toBe(
      'auth *** rejected',
    );
  });
});
