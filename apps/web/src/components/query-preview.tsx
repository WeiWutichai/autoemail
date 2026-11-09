import type { QueryPreviewResult } from '@erp-mail/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Result of "ตรวจ query": missing required columns + the first rows. */
export function QueryPreview({ preview }: { preview: QueryPreviewResult }) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border p-3">
      <p className="text-sm">
        ได้ {preview.rowCount.toLocaleString('th-TH')} แถว ใน {preview.durationMs} ms
        {preview.rowCount > preview.rows.length && ` (แสดง ${preview.rows.length} แถวแรก)`}
      </p>
      {preview.rowCount === 0 && (
        <p className="text-sm text-muted-foreground">
          query ไม่คืนแถวใดเลย จึงยังตรวจชื่อคอลัมน์ไม่ได้
        </p>
      )}
      {preview.missingColumns.length > 0 ? (
        <p className="text-sm text-destructive">
          ขาดคอลัมน์ที่จำเป็น: {preview.missingColumns.join(', ')} — ตั้งชื่อด้วย AS หรือใช้ column
          mapping
        </p>
      ) : (
        preview.rowCount > 0 && <p className="text-sm text-green-700">คอลัมน์ที่จำเป็นครบแล้ว</p>
      )}
      {preview.rows.length > 0 && (
        <div className="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {preview.columns.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap">
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row, i) => (
                <TableRow key={i}>
                  {preview.columns.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap text-xs">
                      {cell(row[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
