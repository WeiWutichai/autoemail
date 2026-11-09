import { applyColumnMapping, normalizeRow, rawResultRows, toJsonSafe } from './erp-rows';

describe('rawResultRows', () => {
  it('unwraps each driver shape', () => {
    expect(rawResultRows('POSTGRES', { rows: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(rawResultRows('MYSQL', [[{ a: 1 }], []])).toEqual([{ a: 1 }]);
    expect(rawResultRows('MSSQL', [{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(rawResultRows('ORACLE', [{ A: 1 }])).toEqual([{ A: 1 }]);
    expect(rawResultRows('POSTGRES', null)).toEqual([]);
    expect(rawResultRows('MYSQL', { affectedRows: 1 })).toEqual([]);
  });
});

describe('toJsonSafe', () => {
  it('converts driver values', () => {
    expect(toJsonSafe(new Date('2026-11-09T00:00:00Z'))).toBe('2026-11-09T00:00:00.000Z');
    expect(toJsonSafe(10n)).toBe('10');
    expect(toJsonSafe(undefined)).toBeNull();
    expect(toJsonSafe(Number.NaN)).toBeNull();
    expect(toJsonSafe(Buffer.from('x'))).toBeNull();
    expect(toJsonSafe(true)).toBe(true);
    expect(toJsonSafe({ toString: () => '1.50' })).toBe('1.50');
  });
});

describe('normalizeRow / applyColumnMapping', () => {
  it('lower-cases keys and renames mapped columns', () => {
    const row = normalizeRow({ ERP_REF_ID: 'A1', Z_Email: 'a@x.com' });
    expect(row).toEqual({ erp_ref_id: 'A1', z_email: 'a@x.com' });
    expect(applyColumnMapping(row, { email: 'Z_EMAIL' })).toEqual({
      erp_ref_id: 'A1',
      z_email: 'a@x.com',
      email: 'a@x.com',
    });
    expect(applyColumnMapping(row, null)).toBe(row);
  });
});
