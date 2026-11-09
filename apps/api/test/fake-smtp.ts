import type { AddressInfo } from 'node:net';
import { SMTPServer } from 'smtp-server';

export interface ReceivedMail {
  from: string;
  to: string[];
  raw: string;
}

/** In-process SMTP server for e2e tests (no TLS, any login accepted). */
export class FakeSmtp {
  readonly received: ReceivedMail[] = [];
  /** RCPT TO addresses that get a 550. */
  readonly rejectRecipients = new Set<string>();
  private server?: SMTPServer;
  port = 0;

  async start(port = 0): Promise<number> {
    this.server = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onAuth: (_auth, _session, cb) => cb(null, { user: 'test' }),
      onRcptTo: (address, _session, cb) => {
        if (this.rejectRecipients.has(address.address)) {
          const err = Object.assign(new Error('5.1.1 Mailbox does not exist'), {
            responseCode: 550,
          });
          return cb(err);
        }
        cb();
      },
      onData: (stream, session, cb) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => {
          this.received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
            to: session.envelope.rcptTo.map((r) => r.address),
            raw: Buffer.concat(chunks).toString('utf8'),
          });
          cb();
        });
      },
    });
    await new Promise<void>((resolve) => this.server?.listen(port, '127.0.0.1', resolve));
    this.port = (this.server.server.address() as AddressInfo).port;
    return this.port;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
