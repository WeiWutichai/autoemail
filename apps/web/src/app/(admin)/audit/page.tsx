'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { useAuditLogs, usePdpaErase } from '@/lib/mails';

const ACTION_GROUPS: [string, string][] = [
  ['', 'ทุกการกระทำ'],
  ['connection', 'Connections'],
  ['sync_config', 'Sync'],
  ['smtp', 'SMTP'],
  ['template', 'Templates'],
  ['mail', 'Retry / Cancel'],
  ['admin_user', 'Admin users'],
  ['pdpa', 'PDPA'],
];

function PdpaCard() {
  const erase = usePdpaErase();
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (email.trim()) setConfirming(true);
  };

  const onConfirm = async () => {
    try {
      const res = await erase.mutateAsync(email.trim());
      toast.success(
        `ลบข้อมูลของ ${email.trim()} แล้ว: รายชื่อ ${res.contactsDeleted} รายการ, เนื้อหาเมล ${res.mailsScrubbed} ฉบับ`,
      );
      setEmail('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">ลบข้อมูลส่วนบุคคล (PDPA)</CardTitle>
        <CardDescription>
          เมื่อได้รับคำขอให้ลบข้อมูล: ระบบจะลบรายชื่อที่มีอีเมลนี้ ลบเนื้อหาเมลที่ส่งถึงอีเมลนี้
          และยกเลิกเมลที่ยังไม่ได้ส่ง — ควรลบที่ ERP ด้วย
          ไม่เช่นนั้นการดึงรอบถัดไปอาจนำรายชื่อกลับมา
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input
            type="email"
            className="w-80"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="destructive" disabled={!email.trim()}>
            ลบข้อมูล
          </Button>
        </form>
      </CardContent>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ลบข้อมูลของ {email.trim()}?</DialogTitle>
            <DialogDescription>
              ลบแล้วกู้คืนไม่ได้ การกระทำนี้ถูกบันทึกใน audit log
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              ยกเลิก
            </Button>
            <Button variant="destructive" disabled={erase.isPending} onClick={onConfirm}>
              ยืนยันการลบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAuditLogs(action, page);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit &amp; PDPA</h1>
        <p className="text-sm text-muted-foreground">
          ประวัติการกระทำของผู้ดูแลระบบ — รหัสผ่านไม่ถูกบันทึก
        </p>
      </div>

      <PdpaCard />

      <NativeSelect
        className="w-56"
        aria-label="ประเภท"
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPage(1);
        }}
      >
        {ACTION_GROUPS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา</TableHead>
            <TableHead>ผู้ดูแล</TableHead>
            <TableHead>การกระทำ</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead>ข้อมูลที่ส่ง</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                ยังไม่มีประวัติ
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {formatDateTime(a.createdAt)}
              </TableCell>
              <TableCell>{a.adminEmail ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs">{a.action}</TableCell>
              <TableCell className="font-mono text-xs">{a.target ?? '—'}</TableCell>
              <TableCell className="max-w-md">
                {a.diff && (
                  <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                    {JSON.stringify(a.diff, null, 1)}
                  </pre>
                )}
              </TableCell>
              <TableCell className="text-xs">{a.ip ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ก่อนหน้า
        </Button>
        <span className="text-sm">
          หน้า {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
