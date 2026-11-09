import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FakeSmtp } from './fake-smtp';
import { createAdmin, createTestApp, loginApi, resetDb, type TestApi } from './utils';

describe('SMTP configs + templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let api: TestApi;
  const smtpServer = new FakeSmtp();

  beforeAll(async () => {
    await smtpServer.start();
    ({ app, prisma } = await createTestApp((b) =>
      b.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true }),
    ));
  });

  beforeEach(async () => {
    await resetDb(prisma);
    smtpServer.received.length = 0;
    await createAdmin(prisma, { email: 'root@example.com', password: 'root-password' });
    api = await loginApi(app, 'root@example.com', 'root-password');
  });

  afterAll(async () => {
    await app.close();
    await smtpServer.stop();
  });

  const smtpInput = () => ({
    name: 'Fake',
    host: '127.0.0.1',
    port: smtpServer.port,
    username: 'relay@example.com',
    password: 'app-password-123',
    fromName: 'ERP Relay',
    fromEmail: 'relay@example.com',
  });

  const templateInput = {
    code: 'pr_pending',
    name: 'PR รออนุมัติ',
    subjectTpl: '{{doc_type}} {{order_no}} รออนุมัติ',
    bodyHtmlTpl: '<p>เรียน {{department}}</p><p>ผู้ขาย: {{supplier_name}}</p>',
    sampleVariables: {
      doc_type: 'PR',
      order_no: 'PR-0001',
      department: 'จัดซื้อ',
      supplier_name: 'A&B',
    },
  };

  it('creates an SMTP config, hides the password and tests it', async () => {
    const created = await api.post('/smtp-configs').send(smtpInput()).expect(201);
    expect(created.body).toMatchObject({ hasPassword: true, isDefault: true, secure: false });
    expect(JSON.stringify(created.body)).not.toContain('app-password-123');
    const row = await prisma.smtpConfig.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.passwordEnc).toMatch(/^v1:/);

    const verify = await api.post(`/smtp-configs/${created.body.id}/test`).send({}).expect(200);
    expect(verify.body).toMatchObject({ ok: true });

    const sent = await api
      .post(`/smtp-configs/${created.body.id}/test`)
      .send({ to: 'admin@example.com' })
      .expect(200);
    expect(sent.body).toMatchObject({ ok: true, messageId: expect.any(String) });
    expect(smtpServer.received[0].to).toEqual(['admin@example.com']);

    const second = await api
      .post('/smtp-configs')
      .send({ ...smtpInput(), name: 'Second', isDefault: true })
      .expect(201);
    const list = await api.get('/smtp-configs').expect(200);
    expect(list.body.filter((s: { isDefault: boolean }) => s.isDefault)).toEqual([
      expect.objectContaining({ id: second.body.id }),
    ]);
  });

  it('reports an unreachable SMTP server', async () => {
    const { body } = await api
      .post('/smtp-configs')
      .send({ ...smtpInput(), port: 1 })
      .expect(201);
    const res = await api.post(`/smtp-configs/${body.id}/test`).send({}).expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).not.toContain('app-password-123');
  });

  it('versions templates, previews and test-sends', async () => {
    await api.post('/smtp-configs').send(smtpInput()).expect(201);
    const { body: tpl } = await api.post('/templates').send(templateInput).expect(201);
    expect(tpl).toMatchObject({ code: 'pr_pending', version: 1 });

    await api.post('/templates').send(templateInput).expect(409);
    const invalid = await api
      .post('/templates')
      .send({ ...templateInput, code: 'broken', bodyHtmlTpl: '{{#if x}}' })
      .expect(400);
    expect(invalid.body).toMatchObject({
      code: 'TEMPLATE_INVALID',
      details: { field: 'bodyHtmlTpl' },
    });

    const updated = await api
      .patch(`/templates/${tpl.id}`)
      .send({ subjectTpl: '[แจ้งเตือน] {{doc_type}} {{order_no}}' })
      .expect(200);
    expect(updated.body.version).toBe(2);
    const versions = await api.get(`/templates/${tpl.id}/versions`).expect(200);
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    const preview = await api
      .post('/templates/preview')
      .send({
        subjectTpl: updated.body.subjectTpl,
        bodyHtmlTpl: tpl.bodyHtmlTpl,
        variables: templateInput.sampleVariables,
      })
      .expect(200);
    expect(preview.body).toMatchObject({
      subject: '[แจ้งเตือน] PR PR-0001',
      html: '<p>เรียน จัดซื้อ</p><p>ผู้ขาย: A&amp;B</p>',
      text: 'เรียน จัดซื้อ\nผู้ขาย: A&B',
    });

    const sent = await api
      .post(`/templates/${tpl.id}/test-send`)
      .send({ to: 'buyer@example.com', variables: templateInput.sampleVariables })
      .expect(200);
    expect(sent.body).toMatchObject({ ok: true });
    expect(smtpServer.received).toHaveLength(1);
    expect(smtpServer.received[0].raw).toContain('buyer@example.com');

    const queue = await prisma.mailQueue.findUniqueOrThrow({
      where: { id: sent.body.queueId },
      include: { logs: { orderBy: { createdAt: 'asc' } } },
    });
    expect(queue).toMatchObject({ status: 'SENT', templateVersion: 2, connectionId: null });
    expect(queue.logs.map((l) => l.event)).toEqual(['QUEUED', 'SENDING', 'SENT']);

    await api.delete(`/templates/${tpl.id}`).expect(409);
    await api.patch(`/templates/${tpl.id}`).send({ isActive: false }).expect(200);
  });

  it('records a rejected recipient as a dead test send', async () => {
    await api.post('/smtp-configs').send(smtpInput()).expect(201);
    const { body: tpl } = await api.post('/templates').send(templateInput).expect(201);
    smtpServer.rejectRecipients.add('nobody@example.com');
    const res = await api
      .post(`/templates/${tpl.id}/test-send`)
      .send({ to: 'nobody@example.com' })
      .expect(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain('550');
    const queue = await prisma.mailQueue.findUniqueOrThrow({ where: { id: res.body.queueId } });
    expect(queue.status).toBe('DEAD');
  });
});
