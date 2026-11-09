import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { SmtpConfig } from '@prisma/client';
import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { CryptoService } from '../common/crypto/crypto.service';

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  messageId: string;
  response: string;
}

export type TransportFactory = (
  options: SMTPTransport.Options,
) => Transporter<SMTPTransport.SentMessageInfo>;

const MAX_ERROR_LENGTH = 500;

/** SMTP failure, classified for the retry policy (DESIGN section 6). */
export class SmtpSendError extends Error {
  constructor(
    message: string,
    /** Retrying will not help (e.g. 550 mailbox unavailable). */
    readonly permanent: boolean,
    readonly responseCode?: number,
  ) {
    super(message);
    this.name = 'SmtpSendError';
  }
}

interface NodemailerError {
  message?: string;
  code?: string;
  responseCode?: number;
  response?: string;
}

/**
 * 5xx replies are permanent except authentication failures (a config problem that the admin
 * can fix, so the mail should wait). Timeouts, connection errors and 4xx replies are retried.
 */
export function classifySmtpError(err: unknown, password?: string): SmtpSendError {
  const e = (err ?? {}) as NodemailerError;
  const code = e.responseCode;
  const permanent =
    e.code !== 'EAUTH' &&
    ((typeof code === 'number' && code >= 500) || (e.code === 'EENVELOPE' && code === undefined));
  let message = e.response || e.message || String(err);
  if (password) message = message.split(password).join('***');
  message = message.replace(/\s+/g, ' ').trim() || 'SMTP error';
  if (message.length > MAX_ERROR_LENGTH) message = `${message.slice(0, MAX_ERROR_LENGTH)}…`;
  return new SmtpSendError(message, permanent, code);
}

/** One pooled Nodemailer transport per SMTP config, rebuilt when the config changes. */
@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly transports = new Map<string, { version: number; transport: Transporter }>();
  private readonly createTransport: TransportFactory;

  constructor(
    private readonly crypto: CryptoService,
    createTransport?: TransportFactory,
  ) {
    this.createTransport = createTransport ?? ((options) => nodemailer.createTransport(options));
  }

  /** Throws {@link SmtpSendError}. */
  async send(smtp: SmtpConfig, mail: OutgoingMail): Promise<SendResult> {
    const transport = this.get(smtp);
    try {
      const info = (await transport.sendMail({
        from: { name: smtp.fromName, address: smtp.fromEmail },
        to: mail.to,
        cc: mail.cc?.length ? mail.cc : undefined,
        bcc: mail.bcc?.length ? mail.bcc : undefined,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      })) as SMTPTransport.SentMessageInfo;
      return { messageId: info.messageId, response: info.response };
    } catch (err) {
      throw classifySmtpError(err, this.password(smtp));
    }
  }

  /** Connects and authenticates with a throwaway transport. Throws {@link SmtpSendError}. */
  async verify(smtp: SmtpConfig): Promise<void> {
    const transport = this.createTransport(this.options(smtp, false));
    try {
      await transport.verify();
    } catch (err) {
      throw classifySmtpError(err, this.password(smtp));
    } finally {
      transport.close();
    }
  }

  invalidate(id: string): void {
    this.transports.get(id)?.transport.close();
    this.transports.delete(id);
  }

  onModuleDestroy(): void {
    for (const { transport } of this.transports.values()) transport.close();
    this.transports.clear();
  }

  private get(smtp: SmtpConfig): Transporter {
    const version = smtp.updatedAt.getTime();
    const cached = this.transports.get(smtp.id);
    if (cached?.version === version) return cached.transport;
    cached?.transport.close();
    const transport = this.createTransport(this.options(smtp, true));
    this.transports.set(smtp.id, { version, transport });
    return transport;
  }

  private options(smtp: SmtpConfig, pool: boolean): SMTPTransport.Options {
    const pass = this.password(smtp);
    return {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.username ? { user: smtp.username, pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      ...(pool ? { pool: true, maxConnections: 2 } : {}),
    } as SMTPTransport.Options;
  }

  private password(smtp: SmtpConfig): string | undefined {
    return smtp.passwordEnc ? this.crypto.decrypt(smtp.passwordEnc) : undefined;
  }
}
