'use client';

import { REQUIRED_COLUMNS, type SyncConfigDto, type SyncKind } from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckboxField } from '@/components/checkbox-field';
import { QueryPreview } from '@/components/query-preview';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useConnections } from '@/lib/connections';
import { errorMessage } from '@/lib/error-messages';
import { formatInterval } from '@/lib/format';
import { useSmtpConfigs } from '@/lib/smtp';
import {
  useCreateSyncConfig,
  useDeleteSyncConfig,
  usePreviewQuery,
  useRunSync,
  useSyncConfigs,
  useUpdateSyncConfig,
} from '@/lib/sync';
import {
  emptySyncForm,
  formFromSyncConfig,
  parseMapping,
  PR_PO_QUERY,
  SYNC_KIND_LABELS,
  toCreateSyncInput,
  toUpdateSyncInput,
  type SyncForm,
} from '@/lib/sync-form';
import { useTemplates } from '@/lib/templates';

/** Kinds that can be created from this page. */
const AVAILABLE_KINDS: SyncKind[] = ['OUTBOX', 'CONTACTS'];

const KIND_HINTS: Record<SyncKind, string> = {
  CONTACTS:
    'คอลัมน์ที่ใช้ได้: erp_ref_id (รหัสไม่ซ้ำ), email, name, phone, company — คอลัมน์อื่นเก็บไว้เป็นข้อมูลเพิ่มเติม',
  OUTBOX:
    'คอลัมน์ที่ใช้ได้: erp_ref_id (รหัสไม่ซ้ำ), to_email, cc, bcc, template_code — คอลัมน์อื่นใช้เป็นตัวแปรใน template',
};

/** `undefined` = closed, `null` = create, otherwise edit. */
type DialogTarget = SyncConfigDto | null | undefined;

function SyncDialog({ target, onClose }: { target: DialogTarget; onClose: () => void }) {
  const { data: connections } = useConnections();
  const create = useCreateSyncConfig();
  const update = useUpdateSyncConfig();
  const preview = usePreviewQuery();
  const editing = target ?? null;
  const activeConnections = connections?.filter(
    (c) => c.isActive || c.id === editing?.connectionId,
  );
  const [form, setForm] = useState<SyncForm>(() =>
    editing ? formFromSyncConfig(editing) : emptySyncForm('', 'OUTBOX'),
  );
  const { data: templates } = useTemplates();
  const { data: smtpConfigs } = useSmtpConfigs();
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<SyncForm>) => setForm((f) => ({ ...f, ...patch }));
  const pending = create.isPending || update.isPending;

  const runPreview = async () => {
    setError(null);
    const mapping = parseMapping(form.mapping);
    if (!mapping.ok) return setError(mapping.error);
    if (!form.connectionId) return setError('กรุณาเลือก connection');
    if (!form.querySql.trim()) return setError('กรุณากรอก SQL query');
    try {
      await preview.mutateAsync({
        connectionId: form.connectionId,
        kind: form.kind,
        querySql: form.querySql,
        columnMapping: mapping.data,
      });
    } catch (err) {
      preview.reset();
      setError(errorMessage(err));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const result = toUpdateSyncInput(form, editing);
        if (!result.ok) return setError(result.error);
        if (result.data) await update.mutateAsync({ id: editing.id, input: result.data });
        toast.success(`บันทึก ${form.name.trim()} แล้ว`);
      } else {
        const result = toCreateSyncInput(form);
        if (!result.ok) return setError(result.error);
        await create.mutateAsync(result.data);
        toast.success(`เพิ่ม ${result.data.name} แล้ว`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข ${editing.name}` : 'เพิ่มการดึงข้อมูล'}</DialogTitle>
            <DialogDescription>
              SQL ต้องเป็นคำสั่ง SELECT เดียว ระบบจะรันตามรอบเวลาที่กำหนด
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sync-conn">Connection</Label>
              <NativeSelect
                id="sync-conn"
                value={form.connectionId}
                disabled={editing !== null}
                onChange={(e) => set({ connectionId: e.target.value })}
              >
                <option value="">— เลือก —</option>
                {activeConnections?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-kind">ชนิดข้อมูล</Label>
              <NativeSelect
                id="sync-kind"
                value={form.kind}
                disabled={editing !== null}
                onChange={(e) => set({ kind: e.target.value as SyncKind })}
              >
                {(editing ? [editing.kind] : AVAILABLE_KINDS).map((kind) => (
                  <option key={kind} value={kind}>
                    {SYNC_KIND_LABELS[kind]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="sync-name">ชื่อ</Label>
              <Input
                id="sync-name"
                placeholder="เช่น อีเมลแผนก"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sync-interval">ดึงทุก (นาที)</Label>
              <Input
                id="sync-interval"
                inputMode="numeric"
                value={form.intervalMin}
                onChange={(e) => set({ intervalMin: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sync-sql">SQL query</Label>
            <Textarea
              id="sync-sql"
              rows={10}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={
                form.kind === 'OUTBOX'
                  ? 'SELECT DocNo AS erp_ref_id, Email AS to_email, ...\nFROM ...'
                  : 'SELECT DeptCode AS erp_ref_id, Email AS email, DeptName AS name\nFROM Z_MaIL'
              }
              value={form.querySql}
              onChange={(e) => {
                set({ querySql: e.target.value });
                preview.reset();
              }}
            />
            <p className="text-xs text-muted-foreground">{KIND_HINTS[form.kind]}</p>
            <p className="text-xs text-muted-foreground">
              ต้องมี: {REQUIRED_COLUMNS[form.kind].join(', ')}
            </p>
            {form.kind === 'OUTBOX' && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => {
                  set({ querySql: PR_PO_QUERY });
                  preview.reset();
                }}
              >
                ใส่ query PR/PO รออนุมัติ (SQL Server)
              </Button>
            )}
          </div>

          {form.kind === 'OUTBOX' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sync-template">Template</Label>
                <NativeSelect
                  id="sync-template"
                  value={form.templateId}
                  onChange={(e) => set({ templateId: e.target.value })}
                >
                  <option value="">— เลือก —</option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                      {t.isActive ? '' : ' (ปิดใช้งาน)'}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  ถ้า query มีคอลัมน์ template_code ระบบจะใช้ template ตามแถวนั้นแทน
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-smtp">ส่งผ่าน SMTP</Label>
                <NativeSelect
                  id="sync-smtp"
                  value={form.smtpConfigId}
                  onChange={(e) => set({ smtpConfigId: e.target.value })}
                >
                  <option value="">SMTP ค่าเริ่มต้น</option>
                  {smtpConfigs?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}
          {form.kind === 'OUTBOX' && !editing && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              เมื่อเปิดใช้งาน รอบแรกจะส่งเมลสำหรับทุกแถวที่ query คืนมา (เช่น
              เอกสารที่รออนุมัติอยู่ทั้งหมดตอนนี้) หลังจากนั้นจะส่งเฉพาะแถวใหม่ — แต่ละ erp_ref_id
              ส่งครั้งเดียว กด &quot;ตรวจ query&quot; เพื่อดูจำนวนก่อน
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="sync-mapping">Column mapping (ไม่บังคับ)</Label>
            <Textarea
              id="sync-mapping"
              rows={2}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="email=Z_Email"
              value={form.mapping}
              onChange={(e) => {
                set({ mapping: e.target.value });
                preview.reset();
              }}
            />
            <p className="text-xs text-muted-foreground">
              ใช้เมื่อแก้ชื่อคอลัมน์ใน query ไม่ได้ — บรรทัดละ 1 คู่ ชื่อที่ระบบใช้=ชื่อคอลัมน์จาก
              query
            </p>
          </div>

          <CheckboxField
            id="sync-active"
            label="เปิดใช้งาน (ดึงอัตโนมัติตามรอบ)"
            checked={form.isActive}
            onChange={(isActive) => set({ isActive })}
          />

          {preview.data && <QueryPreview preview={preview.data} />}
          {error && <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              disabled={preview.isPending}
              onClick={runPreview}
            >
              {preview.isPending ? 'กำลังรัน query…' : 'ตรวจ query'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                บันทึก
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
  const [dialogTarget, setDialogTarget] = useState<DialogTarget>(undefined);
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
        <Button onClick={() => setDialogTarget(null)}>เพิ่มการดึงข้อมูล</Button>
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
              <TableCell className="font-medium">{config.name}</TableCell>
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
                <Button variant="outline" size="sm" onClick={() => setDialogTarget(config)}>
                  แก้ไข
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

      {dialogTarget !== undefined && (
        <SyncDialog
          key={dialogTarget?.id ?? 'new'}
          target={dialogTarget}
          onClose={() => setDialogTarget(undefined)}
        />
      )}
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
