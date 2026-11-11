'use client';

import { REQUIRED_COLUMNS, type SyncConfigDto, type SyncKind } from '@erp-mail/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckboxField } from '@/components/checkbox-field';
import { QueryExplain } from '@/components/query-explain';
import { QueryPreview } from '@/components/query-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { useConnections } from '@/lib/connections';
import { errorMessage } from '@/lib/error-messages';
import { useSmtpConfigs } from '@/lib/smtp';
import { useCreateSyncConfig, usePreviewQuery, useUpdateSyncConfig } from '@/lib/sync';
import {
  emptySyncForm,
  formFromSyncConfig,
  parseMapping,
  PR_PO_DESCRIPTION,
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

/** Full-page create / edit form of a sync config (`config` null = create). */
export function SyncEditor({ config }: { config: SyncConfigDto | null }) {
  const router = useRouter();
  const onClose = () => router.push('/sync');
  const { data: connections } = useConnections();
  const create = useCreateSyncConfig();
  const update = useUpdateSyncConfig();
  const preview = usePreviewQuery();
  const editing = config;
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
    <form onSubmit={onSubmit} noValidate className="min-w-0 space-y-6">
      <div className="sticky top-0 z-10 -mx-8 -mt-8 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 px-8 py-4 backdrop-blur">
        <div className="min-w-0">
          <Link href="/sync" className="text-sm text-muted-foreground hover:underline">
            ← กลับไปหน้า Sync
          </Link>
          <h1 className="truncate text-2xl font-semibold">
            {editing ? `แก้ไข ${editing.name}` : 'เพิ่มการดึงข้อมูล'}
          </h1>
          <p className="text-sm text-muted-foreground">
            SQL ต้องเป็นคำสั่ง SELECT เดียว ระบบจะรันตามรอบเวลาที่กำหนด
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={preview.isPending}
            onClick={runPreview}
          >
            {preview.isPending ? 'กำลังรัน query…' : 'ตรวจ query'}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={pending}>
            บันทึก
          </Button>
        </div>
      </div>
      {error && <p className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3">
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

          <div className="grid grid-cols-[1fr_7rem] gap-3">
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
            <Label htmlFor="sync-description">คำอธิบาย (ไม่บังคับ)</Label>
            <Textarea
              id="sync-description"
              rows={2}
              maxLength={500}
              placeholder="เช่น PR / PO ที่ยังไม่อนุมัติ ส่งแจ้งอีเมลของแผนกเจ้าของเอกสาร"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              อธิบายเป็นภาษาคนว่า query นี้ดึงเอกสารอะไร และส่งถึงใคร — แสดงในตาราง Sync
            </p>
          </div>

          {form.kind === 'OUTBOX' && (
            <div className="grid gap-3">
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
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sync-sql">SQL query</Label>
            <Textarea
              id="sync-sql"
              rows={18}
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
            <QueryExplain sql={form.querySql} kind={form.kind} />
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
                  set({
                    querySql: PR_PO_QUERY,
                    ...(form.description.trim() ? {} : { description: PR_PO_DESCRIPTION }),
                  });
                  preview.reset();
                }}
              >
                ใส่ query PR/PO รออนุมัติ (SQL Server)
              </Button>
            )}
          </div>

          {preview.data ? (
            <QueryPreview preview={preview.data} />
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              กด &quot;ตรวจ query&quot; เพื่อดูผลลัพธ์และรายชื่อผู้รับ — ยังไม่มีการส่งเมล
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
