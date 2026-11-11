'use client';

import type { SyncConfigDto } from '@erp-mail/shared';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { SyncStatus, toastSyncResult } from '@/components/sync-result';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { errorMessage } from '@/lib/error-messages';
import { formatInterval } from '@/lib/format';
import { useDeleteSyncConfig, useRunSync, useSyncConfigs, useUpdateSyncConfig } from '@/lib/sync';
import { SYNC_KIND_LABELS } from '@/lib/sync-form';

function DeleteDialog({ target, onClose }: { target: SyncConfigDto | null; onClose: () => void }) {
  const remove = useDeleteSyncConfig();

  const onConfirm = async () => {
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      toast.success(`ลบ ${target.name} แล้ว`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ลบ {target?.name}?</DialogTitle>
          <DialogDescription>
            ระบบจะหยุดดึงข้อมูลนี้ ข้อมูลที่ดึงมาแล้วยังอยู่ ลบแล้วกู้คืนไม่ได้
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={onConfirm}>
            ลบ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SyncPage() {
  const { data: configs, isLoading, error } = useSyncConfigs();
  const update = useUpdateSyncConfig();
  const run = useRunSync();
  const [deleteTarget, setDeleteTarget] = useState<SyncConfigDto | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const runNow = async (config: SyncConfigDto) => {
    setRunningId(config.id);
    try {
      toastSyncResult(config.name, config.kind, await run.mutateAsync(config.id));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunningId(null);
    }
  };

  const toggleActive = async (config: SyncConfigDto) => {
    try {
      await update.mutateAsync({ id: config.id, input: { isActive: !config.isActive } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sync</h1>
          <p className="text-sm text-muted-foreground">
            ตั้งค่าการดึงข้อมูลจาก ERP ด้วย SQL — worker จะดึงอัตโนมัติตามรอบเวลา
          </p>
        </div>
        <Button asChild>
          <Link href="/sync/new">เพิ่มการดึงข้อมูล</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead>ชนิด</TableHead>
            <TableHead>รอบ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ดึงล่าสุด</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {configs?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                ยังไม่มีการตั้งค่า — กด &quot;เพิ่มการดึงข้อมูล&quot; เพื่อเริ่มต้น
              </TableCell>
            </TableRow>
          )}
          {configs?.map((config) => (
            <TableRow key={config.id}>
              <TableCell className="max-w-xs">
                <Link href={`/sync/${config.id}`} className="font-medium hover:underline">
                  {config.name}
                </Link>
                {config.description && (
                  <div className="whitespace-pre-wrap text-xs text-muted-foreground">
                    {config.description}
                  </div>
                )}
              </TableCell>
              <TableCell>{config.connectionName}</TableCell>
              <TableCell>
                <div>{SYNC_KIND_LABELS[config.kind]}</div>
                {config.kind === 'OUTBOX' && (
                  <div className="text-xs text-muted-foreground">
                    {config.templateCode} · {config.smtpConfigName ?? 'SMTP ค่าเริ่มต้น'}
                  </div>
                )}
              </TableCell>
              <TableCell>{formatInterval(config.pollIntervalSec)}</TableCell>
              <TableCell>
                {config.isActive ? (
                  <Badge>ใช้งาน</Badge>
                ) : (
                  <Badge variant="secondary">ปิดการใช้งาน</Badge>
                )}
              </TableCell>
              <TableCell>
                <SyncStatus config={config} />
              </TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningId !== null}
                  onClick={() => runNow(config)}
                >
                  {runningId === config.id ? 'กำลังดึง…' : 'Sync now'}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/sync/${config.id}`}>แก้ไข</Link>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => toggleActive(config)}
                >
                  {config.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(config)}>
                  ลบ
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
