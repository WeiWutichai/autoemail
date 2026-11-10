import { explainCondition, explainQuery } from './query-explain';
import { PR_PO_QUERY } from './sync-form';

describe('explainCondition', () => {
  it('translates yes/no flags in both directions', () => {
    expect(explainCondition('S.IsApproved = 0').meaning).toBe('ยังไม่อนุมัติ');
    expect(explainCondition('IsApproved = 1').meaning).toBe('อนุมัติแล้ว');
    expect(explainCondition('S.IsClosed <> 1').meaning).toBe('ยังไม่ยกเลิก');
    expect(explainCondition('ISNULL(S.IsComplete, 0) = 1').meaning).toBe('ปิดงานแล้ว');
  });

  it('warns that <> drops NULL rows unless ISNULL is used', () => {
    expect(explainCondition('S.IsClosed <> 1').warning).toContain('NULL');
    expect(explainCondition('ISNULL(S.IsClosed, 0) <> 1').warning).toBeNull();
    expect(explainCondition('S.IsApproved = 0').warning).toBeNull();
  });

  it('recognises blank checks, recent dates, joins and NULL tests', () => {
    expect(explainCondition("LTRIM(RTRIM(ISNULL(m.Email, ''))) <> ''").meaning).toBe(
      'Email ต้องไม่ว่าง',
    );
    expect(explainCondition("d.dept_code <> ' '").meaning).toBe('dept_code ต้องไม่ว่าง');
    expect(explainCondition('S.PODate >= DATEADD(day, -30, GETDATE())').meaning).toBe(
      'PODate ภายใน 30 วันล่าสุด',
    );
    expect(explainCondition('m.DeptCode = d.dept_code').meaning).toBe(
      'จับคู่ DeptCode กับ dept_code',
    );
    expect(explainCondition('S.Appr_By IS NOT NULL').meaning).toBe('Appr_By มีค่า');
    expect(explainCondition("S.Status = N'A'").meaning).toBe("Status เท่ากับ 'A'");
  });

  it('leaves unknown shapes without a meaning', () => {
    expect(explainCondition('S.Total * 2 > S.Limit')).toMatchObject({ meaning: null });
  });
});

describe('explainQuery', () => {
  it('explains the bundled PR/PO query', () => {
    const result = explainQuery(PR_PO_QUERY);
    expect(result.sources.map((s) => [s.label, s.conditions.map((c) => c.meaning)])).toEqual([
      ['ใบขอซื้อ (PR)', ['ยังไม่อนุมัติ', 'ยังไม่ปิดงาน', 'ยังไม่ยกเลิก']],
      ['ใบสั่งซื้อ (PO)', ['ยังไม่อนุมัติ', 'ยังไม่ปิดงาน', 'ยังไม่ยกเลิก']],
      [null, ['dept_code ต้องไม่ว่าง', 'Email ต้องไม่ว่าง']],
    ]);
    expect(result.joins).toEqual([
      {
        kind: 'INNER',
        table: 'Z_MaIL',
        label: 'อีเมลของแต่ละแผนก',
        on: [
          {
            sql: 'm.DeptCode = d.dept_code',
            meaning: 'จับคู่ DeptCode กับ dept_code',
            warning: null,
          },
        ],
      },
    ]);
    expect(result.outputs).toEqual(expect.arrayContaining(['erp_ref_id', 'to_email', 'order_no']));
  });

  it('ignores keywords inside strings and comments and keeps BETWEEN together', () => {
    const result = explainQuery(`-- WHERE IsApproved = 1
SELECT DocNo AS erp_ref_id, Email AS to_email
FROM Docs WITH (NOLOCK)
WHERE Note <> 'x WHERE y' AND DocDate BETWEEN '2026-01-01' AND '2026-12-31' AND IsApproved = 1
ORDER BY DocNo`);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].table).toBe('Docs');
    expect(result.sources[0].conditions.map((c) => c.sql)).toEqual([
      "Note <> 'x WHERE y'",
      "DocDate BETWEEN '2026-01-01' AND '2026-12-31'",
      'IsApproved = 1',
    ]);
    expect(result.outputs).toEqual(['erp_ref_id', 'to_email']);
  });

  it('keeps an OR clause whole and handles a query without WHERE', () => {
    expect(
      explainQuery('SELECT a FROM T WHERE x = 1 OR y = 2').sources[0].conditions.map((c) => c.sql),
    ).toEqual(['x = 1 OR y = 2']);
    expect(explainQuery('SELECT * FROM Z_MaIL').sources).toEqual([
      { table: 'Z_MaIL', label: 'อีเมลของแต่ละแผนก', conditions: [] },
    ]);
  });
});
