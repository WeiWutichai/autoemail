import {
  createErpConnectionSchema,
  DB_TYPES,
  DEFAULT_PORTS,
  updateErpConnectionSchema,
} from './connections';

const valid = {
  name: ' ERP-HQ ',
  dbType: 'MSSQL',
  host: 'erp.local',
  port: 1433,
  database: 'ERP',
  username: 'reader',
  password: 'secret',
};

describe('connection schemas', () => {
  it('applies defaults and trims on create', () => {
    const parsed = createErpConnectionSchema.parse(valid);
    expect(parsed.name).toBe('ERP-HQ');
    expect(parsed).toMatchObject({ ssl: false, trustServerCert: false, isActive: true });
  });

  it('accepts SQL Server named instances and IPv6 hosts', () => {
    expect(
      createErpConnectionSchema.safeParse({ ...valid, host: 'SRV01\\SQLEXPRESS' }).success,
    ).toBe(true);
    expect(createErpConnectionSchema.safeParse({ ...valid, host: '[::1]' }).success).toBe(true);
  });

  it('rejects hosts with spaces or connection-string syntax', () => {
    expect(createErpConnectionSchema.safeParse({ ...valid, host: 'a b' }).success).toBe(false);
    expect(createErpConnectionSchema.safeParse({ ...valid, host: 'a;Password=x' }).success).toBe(
      false,
    );
  });

  it('rejects out-of-range ports and unknown db types', () => {
    expect(createErpConnectionSchema.safeParse({ ...valid, port: 70000 }).success).toBe(false);
    expect(createErpConnectionSchema.safeParse({ ...valid, dbType: 'SQLITE' }).success).toBe(false);
  });

  it('allows creating without a password', () => {
    const { password: _omit, ...rest } = valid;
    expect(createErpConnectionSchema.safeParse(rest).success).toBe(true);
  });

  it('requires at least one field on update and rejects empty password', () => {
    expect(updateErpConnectionSchema.safeParse({}).success).toBe(false);
    expect(updateErpConnectionSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateErpConnectionSchema.safeParse({ password: '' }).success).toBe(false);
  });

  it('has a default port for every db type', () => {
    for (const type of DB_TYPES) {
      expect(DEFAULT_PORTS[type]).toBeGreaterThan(0);
    }
  });
});
