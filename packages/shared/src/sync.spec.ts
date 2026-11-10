import { contactListQuerySchema } from './contacts';
import { createSyncConfigSchema, queryPreviewInputSchema, updateSyncConfigSchema } from './sync';

const id = '11111111-1111-4111-8111-111111111111';

describe('sync config schemas', () => {
  it('applies defaults on create', () => {
    const parsed = createSyncConfigSchema.parse({
      connectionId: id,
      name: ' Contacts ',
      kind: 'CONTACTS',
      querySql: 'SELECT 1',
    });
    expect(parsed).toMatchObject({
      name: 'Contacts',
      description: null,
      columnMapping: null,
      pollIntervalSec: 300,
      isActive: true,
    });
  });

  it('bounds the poll interval and validates column names', () => {
    const base = { connectionId: id, name: 'x', kind: 'CONTACTS', querySql: 'SELECT 1' };
    expect(createSyncConfigSchema.safeParse({ ...base, pollIntervalSec: 10 }).success).toBe(false);
    expect(
      createSyncConfigSchema.safeParse({ ...base, columnMapping: { email: 'bad col' } }).success,
    ).toBe(false);
    expect(
      createSyncConfigSchema.safeParse({ ...base, columnMapping: { email: 'Z_Email' } }).success,
    ).toBe(true);
  });

  it('requires a template for outbox configs', () => {
    const base = { connectionId: id, name: 'PR/PO', kind: 'OUTBOX', querySql: 'SELECT 1' };
    const missing = createSyncConfigSchema.safeParse(base);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual(['templateId']);
    expect(createSyncConfigSchema.parse({ ...base, templateId: id }).smtpConfigId).toBeNull();
  });

  it('trims the description, stores blank text as null and caps its length', () => {
    const base = { connectionId: id, name: 'x', kind: 'CONTACTS', querySql: 'SELECT 1' };
    expect(
      createSyncConfigSchema.parse({ ...base, description: '  PR ที่รออนุมัติ ' }).description,
    ).toBe('PR ที่รออนุมัติ');
    expect(createSyncConfigSchema.parse({ ...base, description: '   ' }).description).toBeNull();
    expect(updateSyncConfigSchema.parse({ description: '' })).toEqual({ description: null });
    expect(
      createSyncConfigSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('requires at least one field on update', () => {
    expect(updateSyncConfigSchema.safeParse({}).success).toBe(false);
    expect(updateSyncConfigSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('parses preview input', () => {
    expect(
      queryPreviewInputSchema.parse({ connectionId: id, kind: 'CONTACTS', querySql: 'SELECT 1' })
        .columnMapping,
    ).toBeNull();
  });
});

describe('contactListQuerySchema', () => {
  it('coerces paging and drops empty filters', () => {
    expect(
      contactListQuerySchema.parse({ page: '2', pageSize: '10', q: '', connectionId: '' }),
    ).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  it('caps the page size', () => {
    expect(contactListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
