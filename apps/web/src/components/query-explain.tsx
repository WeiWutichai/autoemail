import { REQUIRED_COLUMNS, type SyncKind } from '@erp-mail/shared';
import { useMemo } from 'react';
import { explainQuery, type ExplainedCondition } from '@/lib/query-explain';
import { useDebounced } from '@/lib/use-debounced';

const JOIN_LABELS = {
  INNER: 'เฉพาะแถวที่จับคู่ได้',
  LEFT: 'ทุกแถว แม้จับคู่ไม่ได้ (ค่าจะว่าง)',
  RIGHT: 'ทุกแถวของตารางที่ join',
  FULL: 'ทุกแถวของทั้งสองฝั่ง',
} as const;

function ConditionList({ conditions }: { conditions: ExplainedCondition[] }) {
  return (
    <ul className="ml-4 list-disc space-y-0.5">
      {conditions.map((c, i) => (
        <li key={i}>
          {c.meaning ? (
            <>
              <span>{c.meaning}</span>{' '}
              <code className="text-[11px] text-muted-foreground">({c.sql})</code>
            </>
          ) : (
            <code className="text-[11px]">{c.sql}</code>
          )}
          {c.warning && <div className="text-amber-700">⚠ {c.warning}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Live plain-language reading of the SQL typed in the Sync dialog. */
export function QueryExplain({ sql, kind }: { sql: string; kind: SyncKind }) {
  const debounced = useDebounced(sql, 300);
  const explanation = useMemo(
    () => (debounced.trim() ? explainQuery(debounced) : null),
    [debounced],
  );
  if (!explanation || explanation.sources.length === 0) return null;

  const missing = REQUIRED_COLUMNS[kind].filter((c) => !explanation.outputs.includes(c));

  return (
    <details open className="rounded-md border bg-muted/40 p-3 text-xs">
      <summary className="cursor-pointer text-sm font-medium">ระบบอ่าน query นี้ได้ว่า</summary>
      <div className="mt-2 space-y-2">
        {explanation.sources.map((source, i) => (
          <div key={i}>
            <div className="font-medium">
              ดึงจาก {source.label ? `${source.label} — ` : ''}
              <code>{source.table}</code>
            </div>
            {source.conditions.length > 0 ? (
              <ConditionList conditions={source.conditions} />
            ) : (
              <div className="ml-4 text-muted-foreground">ไม่มีเงื่อนไข — ดึงทุกแถว</div>
            )}
          </div>
        ))}
        {explanation.joins.map((join, i) => (
          <div key={`j${i}`}>
            <div className="font-medium">
              จับคู่กับ {join.label ? `${join.label} — ` : ''}
              <code>{join.table}</code>{' '}
              <span className="font-normal text-muted-foreground">({JOIN_LABELS[join.kind]})</span>
            </div>
            <ConditionList conditions={join.on} />
          </div>
        ))}
        {missing.length > 0 && (
          <p className="text-amber-700">
            ⚠ ไม่พบคอลัมน์ {missing.join(', ')} ในผลลัพธ์ — ตั้งชื่อด้วย AS หรือใช้ column mapping
          </p>
        )}
        <p className="text-muted-foreground">
          สรุปจากการอ่านข้อความ SQL อัตโนมัติ อาจไม่ครบทุกเงื่อนไข — กด &quot;ตรวจ query&quot;
          เพื่อดูผลจริงจาก ERP
        </p>
      </div>
    </details>
  );
}
