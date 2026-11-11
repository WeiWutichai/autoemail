import type { OutboxPreview, QueryPreviewResult } from '@erp-mail/shared';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/error-messages';
import { useCreateSuppression, useDeleteSuppression, useSuppressions } from '@/lib/suppressions';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

const n = (value: number) => value.toLocaleString('th-TH');

/** Who the next outbox run would mail; nothing is sent by the preview. */
function OutboxRecipients({ outbox }: { outbox: OutboxPreview }) {
  const { data: suppressions } = useSuppressions();
  const create = useCreateSuppression();
  const remove = useDeleteSuppression();
  const busy = create.isPending || remove.isPending;
  // The live list wins over the flags of the (possibly older) preview result.
  const suppressedIds = new Map((suppressions ?? []).map((s) => [s.email, s.id]));
  const isSuppressed = (email: string) =>
    suppressions
      ? suppressedIds.has(email)
      : outbox.recipients.some((r) => r.email === email && r.suppressed);
  const changed = outbox.recipients.some((r) => r.suppressed !== isSuppressed(r.email));
  const receiving = outbox.recipients.filter((r) => !isSuppressed(r.email)).length;

  const toggle = async (email: string) => {
    const id = suppressedIds.get(email);
    try {
      if (id) {
        await remove.mutateAsync(id);
        toast.success(`${email} จะได้รับเมลอีกครั้ง`);
      } else {
        await create.mutateAsync({ email, reason: null });
        toast.success(`${email} อยู่ในรายชื่อห้ามส่งแล้ว`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const notes = [
    outbox.alreadyQueued > 0 && `${n(outbox.alreadyQueued)} รายการเคยดึงเข้าคิวแล้ว จะไม่ส่งซ้ำ`,
    outbox.suppressedMails > 0 &&
      `${n(outbox.suppressedMails)} ฉบับไม่ส่ง เพราะผู้รับอยู่ในรายชื่อห้ามส่ง`,
    outbox.duplicateRows > 0 && `${n(outbox.duplicateRows)} แถวมี erp_ref_id ซ้ำ นับเป็นเมลเดียว`,
    outbox.invalidRows > 0 &&
      `${n(outbox.invalidRows)} แถวไม่มี erp_ref_id หรืออีเมลว่าง/ผิดรูปแบบ จะไม่ถูกส่ง`,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3">
      <p className="text-sm font-medium">
        {outbox.newMails > 0
          ? `ถ้าเปิด Sync นี้ รอบถัดไปจะส่งเมลใหม่ ${n(outbox.newMails)} ฉบับ ถึง ${n(receiving)} อีเมล`
          : 'ไม่มีเมลใหม่ที่จะส่งในรอบถัดไป'}
      </p>
      {notes.length > 0 && (
        <ul className="ml-4 list-disc text-xs text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {changed && (
        <p className="text-xs text-amber-700">
          รายชื่อห้ามส่งเปลี่ยนแล้ว — กด &quot;ตรวจ query&quot; อีกครั้งเพื่ออัปเดตจำนวนฉบับ
        </p>
      )}
      {outbox.recipients.length > 0 && (
        <div className="max-h-60 overflow-auto rounded border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>อีเมลผู้รับ (รวม cc/bcc)</TableHead>
                <TableHead className="text-right">จำนวนฉบับ</TableHead>
                <TableHead className="text-right">ส่ง/ไม่ส่ง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outbox.recipients.map((r) => {
                const off = isSuppressed(r.email);
                return (
                  <TableRow key={r.email} className={off ? 'text-muted-foreground' : undefined}>
                    <TableCell className="text-xs">
                      <span className={off ? 'line-through' : undefined}>{r.email}</span>
                      {off && (
                        <Badge variant="secondary" className="ml-2">
                          ห้ามส่ง
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">{n(r.mails)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={busy}
                        onClick={() => toggle(r.email)}
                      >
                        {off ? 'กลับมาส่ง' : 'ไม่ส่งให้อีเมลนี้'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        เป็นการตรวจเท่านั้น ยังไม่มีเมลถูกส่ง — จัดการรายชื่อทั้งหมดได้ที่หน้า{' '}
        <Link href="/suppressions" className="underline">
          รายชื่อห้ามส่ง
        </Link>
      </p>
    </div>
  );
}

/** Result of "ตรวจ query": missing required columns + the first rows. */
export function QueryPreview({ preview }: { preview: QueryPreviewResult }) {
  return (
    <div className="min-w-0 space-y-2 rounded-md border p-3">
      <p className="text-sm">
        ได้ {n(preview.rowCount)} แถว ใน {preview.durationMs} ms
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
      {preview.outbox && <OutboxRecipients outbox={preview.outbox} />}
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
