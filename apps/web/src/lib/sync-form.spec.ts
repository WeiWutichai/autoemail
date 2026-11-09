import type { SyncConfigDto } from '@erp-mail/shared';
import {
  emptySyncForm,
  formFromSyncConfig,
  parseMapping,
  PR_PO_QUERY,
  toCreateSyncInput,
  toUpdateSyncInput,
} from './sync-form';

const connectionId = '11111111-1111-4111-8111-111111111111';
const config: SyncConfigDto = {
  id: '22222222-2222-4222-8222-222222222222',
  connectionId,
  connectionName: 'ERP',
  name: 'Contacts',
  kind: 'CONTACTS',
  querySql: 'SELECT 1',
  columnMapping: { email: 'Z_Email' },
  pollIntervalSec: 300,
  isActive: true,
  lastSyncedAt: null,
  lastResult: null,
  lastError: null,
  templateId: null,
  templateCode: null,
  smtpConfigId: null,
  smtpConfigName: null,
  createdAt: '',
  updatedAt: '',
};

describe('parseMapping', () => {
  it('parses lines and commas, lower-casing targets', () => {
    expect(parseMapping('Email = Z_Email, name=DeptName\n')).toEqual({
      ok: true,
      data: { email: 'Z_Email', name: 'DeptName' },
    });
    expect(parseMapping('  ')).toEqual({ ok: true, data: null });
    expect(parseMapping('email').ok).toBe(false);
    expect(parseMapping('a=b=c').ok).toBe(false);
  });
});

describe('toCreateSyncInput', () => {
  it('converts minutes to seconds and validates', () => {
    const form = {
      ...emptySyncForm(connectionId),
      name: 'X',
      querySql: 'SELECT 1',
      intervalMin: '10',
    };
    expect(toCreateSyncInput(form)).toMatchObject({ ok: true, data: { pollIntervalSec: 600 } });
    expect(toCreateSyncInput({ ...form, intervalMin: '0' })).toEqual({
      ok: false,
      error: 'รอบเวลาต้องอยู่ระหว่าง 1 นาที ถึง 1 วัน (1440 นาที)',
    });
    expect(toCreateSyncInput({ ...form, connectionId: '' })).toEqual({
      ok: false,
      error: 'กรุณาเลือก connection',
    });
  });
});

describe('outbox configs', () => {
  it('requires a template and sends null for the default SMTP', () => {
    const form = {
      ...emptySyncForm(connectionId, 'OUTBOX'),
      name: 'PR/PO',
      querySql: PR_PO_QUERY,
    };
    expect(toCreateSyncInput(form)).toEqual({ ok: false, error: 'กรุณาเลือก template' });
    expect(toCreateSyncInput({ ...form, templateId: connectionId })).toMatchObject({
      ok: true,
      data: { templateId: connectionId, smtpConfigId: null },
    });
  });

  it('only sends changed template / SMTP on update', () => {
    const outbox = { ...config, kind: 'OUTBOX' as const, templateId: connectionId };
    const form = formFromSyncConfig(outbox);
    expect(toUpdateSyncInput(form, outbox)).toEqual({ ok: true, data: null });
    expect(toUpdateSyncInput({ ...form, smtpConfigId: config.id }, outbox)).toEqual({
      ok: true,
      data: { smtpConfigId: config.id },
    });
    expect(toUpdateSyncInput({ ...form, templateId: '' }, outbox).ok).toBe(false);
  });
});

describe('toUpdateSyncInput', () => {
  it('sends only changed fields', () => {
    const form = formFromSyncConfig(config);
    expect(form.mapping).toBe('email=Z_Email');
    expect(toUpdateSyncInput(form, config)).toEqual({ ok: true, data: null });
    expect(toUpdateSyncInput({ ...form, mapping: '', intervalMin: '15' }, config)).toEqual({
      ok: true,
      data: { columnMapping: null, pollIntervalSec: 900 },
    });
  });
});
