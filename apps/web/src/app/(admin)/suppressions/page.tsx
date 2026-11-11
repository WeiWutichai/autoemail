'use client';

import { createSuppressionSchema, MAX_SUPPRESSION_REASON_LENGTH } from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useCreateSuppression, useDeleteSuppression, useSuppressions } from '@/lib/suppressions';

export default function SuppressionsPage() {
  const { data: list, isLoading, error } = useSuppressions();
  const create = useCreateSuppression();
  const remove = useDeleteSuppression();
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createSuppressionSchema.safeParse({ email, reason });
    if (!parsed.success) return setFormError('กรุณากรอกอีเมลให้ถูกต้อง');
    try {
      await create.mutateAsync(parsed.data);
      toast.success(`เพิ่ม ${parsed.data.email} ในรายชื่อห้ามส่งแล้ว`);
      setEmail('');
      setReason('');
      setFormError(null);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const onRemove = async (id: string, address: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success(`เอา ${address} ออกจากรายชื่อห้ามส่งแล้ว`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const term = q.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (s) => !term || s.email.includes(term) || (s.reason ?? '').toLowerCase().includes(term),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">รายชื่อห้ามส่ง</h1>
        <p className="text-sm text-muted-foreground">
          อีเมลในรายการนี้จะไม่ได้รับเมลจากทุก Sync — ถ้าเป็นผู้รับคนเดียวของเมลฉบับนั้น
          เมลจะไม่ถูกส่ง ถ้าเป็นหนึ่งในหลายผู้รับ ระบบจะตัดเฉพาะอีเมลนี้ออก
        </p>
      </div>

      <form
        onSubmit={onAdd}
        noValidate
        className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="sup-email">อีเมล</Label>
          <Input
            id="sup-email"
            type="email"
            placeholder="name@krs.co.th"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-reason">เหตุผล (ไม่บังคับ)</Label>
          <Input
            id="sup-reason"
            maxLength={MAX_SUPPRESSION_REASON_LENGTH}
            placeholder="เช่น ลาออกแล้ว, ไม่ต้องรับแจ้งเตือน"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={create.isPending}>
          เพิ่มในรายชื่อห้ามส่ง
        </Button>
        {formError && <p className="text-sm text-destructive md:col-span-3">{formError}</p>}
      </form>

      <div className="flex items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder="ค้นหาอีเมลหรือเหตุผล"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">
          ทั้งหมด {(list?.length ?? 0).toLocaleString('th-TH')} อีเมล
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>อีเมล</TableHead>
            <TableHead>เหตุผล</TableHead>
            <TableHead>เพิ่มเมื่อ</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {list && shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {list.length === 0 ? 'ยังไม่มีอีเมลในรายชื่อห้ามส่ง' : 'ไม่พบอีเมลที่ค้นหา'}
              </TableCell>
            </TableRow>
          )}
          {shown.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.email}</TableCell>
              <TableCell className="text-muted-foreground">{s.reason ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(s.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => onRemove(s.id, s.email)}
                >
                  เอาออก (ส่งได้อีกครั้ง)
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
