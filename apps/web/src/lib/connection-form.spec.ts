import type { ErpConnectionDto } from '@erp-mail/shared';
import {
  changeDbType,
  emptyConnectionForm,
  formFromConnection,
  toCreateInput,
  toUpdateInput,
} from './connection-form';

const dto: ErpConnectionDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ERP-HQ',
  dbType: 'MSSQL',
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  hasPassword: true,
  ssl: false,
  trustServerCert: true,
  isActive: true,
  lastTestAt: null,
  lastTestOk: null,
  createdAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

describe('connection form', () => {
  it('defaults to SQL Server on port 1433', () => {
    expect(emptyConnectionForm()).toMatchObject({ dbType: 'MSSQL', port: '1433' });
  });

  it('switches the port with the db type only while it is the default', () => {
    const pg = changeDbType(emptyConnectionForm(), 'POSTGRES');
    expect(pg.port).toBe('5432');
    const custom = changeDbType({ ...emptyConnectionForm(), port: '14330' }, 'POSTGRES');
    expect(custom.port).toBe('14330');
  });

  it('builds a create payload and omits an empty password', () => {
    const result = toCreateInput({
      ...emptyConnectionForm(),
      name: 'ERP-HQ',
      host: 'erp.local',
      database: 'ERP',
      username: 'reader',
    });
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ port: 1433, password: undefined }),
    });
  });

  it('rejects a non-numeric port', () => {
    const result = toCreateInput({ ...formFromConnection(dto), port: '14a3' });
    expect(result.ok).toBe(false);
  });

  it('sends only changed fields on update and keeps the password when blank', () => {
    const form = { ...formFromConnection(dto), host: 'erp2.local' };
    expect(toUpdateInput(form, dto)).toEqual({ ok: true, data: { host: 'erp2.local' } });
  });

  it('includes a newly typed password', () => {
    const form = { ...formFromConnection(dto), password: 'new-secret' };
    expect(toUpdateInput(form, dto)).toEqual({ ok: true, data: { password: 'new-secret' } });
  });

  it('returns null data when nothing changed', () => {
    expect(toUpdateInput(formFromConnection(dto), dto)).toEqual({ ok: true, data: null });
  });
});
