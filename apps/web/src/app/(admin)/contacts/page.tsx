'use client';

import type { ContactDto, SyncConfigDto } from '@erp-mail/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SyncStatus, toastSyncResult } from '@/components/sync-result';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useConnections } from '@/lib/connections';
import { useContacts, useDeleteContact, type ContactFilters } from '@/lib/contacts';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import {
  findSuppression,
  useCreateSuppression,
  useDeleteSuppression,
  useSuppressions,
} from '@/lib/suppressions';
import { useCollectContacts, useRunSync, useSyncConfigs } from '@/lib/sync';
import { SYNC_KIND_LABELS } from '@/lib/sync-form';
import { useTemplates, useTestSend } from '@/lib/templates';

/** Template variables for a contact: its ERP columns plus the mapped fields. */
function contactVariables(c: ContactDto): Record<string, unknown> {
  return {
    ...(c.raw ?? {}),
    erp_ref_id: c.erpRefId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
  };
}

function TestSendDialog({ contact, onClose }: { contact: ContactDto; onClose: () => void }) {
  const { data: templates } = useTemplates();
  const testSend = useTestSend();
  const [templateId, setTemplateId] = useState('');
  const [to, setTo] = useState(contact.email ?? '');

  const send = async () => {
    try {
      const res = await testSend.mutateAsync({
        id: templateId,
        input: { to: to.trim(), variables: contactVariables(contact) },
      });
      if (res.ok) {
        toast.success(`ส่งเมลทดสอบถึง ${to.trim()} แล้ว`);
        onClose();
      } else {
        toast.error('ส่งไม่สำเร็จ', { description: res.error, duration: 15000 });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ส่งทดสอบถึง {contact.name ?? contact.email}</DialogTitle>
          <DialogDescription>
            ใช้ข้อมูลของรายชื่อนี้เป็นตัวแปรใน template ส่งทันทีผ่าน SMTP ค่าเริ่มต้น
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ts-template">Template</Label>
          <NativeSelect
            id="ts-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">— เลือก —</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ts-to">ส่งถึง</Label>
          <Input id="ts-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button disabled={!templateId || !to.trim() || testSend.isPending} onClick={send}>
            {testSend.isPending ? 'กำลังส่ง…' : 'ส่ง'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ContactSyncCard() {
  const { data: configs } = useSyncConfigs();
  const run = useRunSync();
  const collect = useCollectContacts();
  const [runningId, setRunningId] = useState<string | null>(null);

  const pull = async (config: SyncConfigDto) => {
    setRunningId(config.id);
    try {
      if (config.kind === 'OUTBOX') {
        const res = await collect.mutateAsync(config.id);
        toast.success(
          `ดึงรายชื่อผู้รับจาก ${config.name}: ใหม่ ${res.created} อัปเดต ${res.updated} (ไม่มีการส่งเมล)`,
        );
      } else {
        toastSyncResult(config.name, config.kind, await run.mutateAsync(config.id));
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ดึงรายชื่อจาก ERP</CardTitle>
        <p className="text-sm text-muted-foreground">
          อีเมลผู้รับของ Sync ส่งเมลถูกเก็บเข้ามาเองทุกรอบที่ Sync ทำงาน — กดปุ่มเพื่อดึงตอนนี้
          (ไม่มีการส่งเมล)
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {configs?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีการตั้งค่าดึงข้อมูล — ไปที่{' '}
            <Link href="/sync" className="underline">
              Sync
            </Link>{' '}
            เพื่อเพิ่ม
          </p>
        )}
        {configs?.map((config) => (
          <div key={config.id} className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">
                {config.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({config.connectionName} · {SYNC_KIND_LABELS[config.kind]})
                </span>
              </div>
              <SyncStatus config={config} />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runningId !== null || (config.kind === 'CONTACTS' && !config.isActive)}
              onClick={() => pull(config)}
            >
              {runningId === config.id
                ? 'กำลังดึง…'
                : config.kind === 'OUTBOX'
                  ? 'ดึงรายชื่อผู้รับ'
                  : 'Sync now'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Suppress / un-suppress a contact for its database (every database when it has none). */
function SendToggle({ contact }: { contact: ContactDto }) {
  const { data: suppressions } = useSuppressions();
  const create = useCreateSuppression();
  const remove = useDeleteSuppression();
  if (!contact.email) return null;
  const email = contact.email;
  const entry = findSuppression(suppressions, email, contact.connectionId);

  const toggle = async () => {
    try {
      if (entry) {
        await remove.mutateAsync(entry.id);
        toast.success(
          entry.connectionId
            ? `${email} จะได้รับเมลจาก ${entry.connectionName} อีกครั้ง`
            : `${email} ถูกเอาออกจากรายชื่อห้ามส่งทุก database แล้ว`,
        );
      } else {
        await create.mutateAsync({ email, connectionId: contact.connectionId, reason: null });
        toast.success(
          contact.connectionName
            ? `${email} จะไม่ได้รับเมลจาก ${contact.connectionName}`
            : `${email} จะไม่ได้รับเมลจากทุก database`,
        );
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="flex items-center gap-2">
      {entry ? (
        <Badge variant="destructive">
          ห้ามส่ง{entry.connectionId === null ? ' (ทุก database)' : ''}
        </Badge>
      ) : (
        <Badge variant="outline">ส่งได้</Badge>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={create.isPending || remove.isPending}
        onClick={toggle}
      >
        {entry ? 'กลับมาส่ง' : 'ห้ามส่ง'}
      </Button>
    </div>
  );
}

export default function ContactsPage() {
  const { data: connections } = useConnections();
  const remove = useDeleteContact();
  const [filters, setFilters] = useState<ContactFilters>({
    connectionId: '',
    source: '',
    q: '',
    page: 1,
  });
  const [search, setSearch] = useState('');
  const [testTarget, setTestTarget] = useState<ContactDto | null>(null);
  const { data, isLoading, isFetching, error } = useContacts(filters);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: search.trim(), page: 1 }));
  };

  const onDelete = async (c: ContactDto) => {
    try {
      await remove.mutateAsync(c.id);
      toast.success(`ลบ ${c.email} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            อีเมลทั้งหมด — ดึงมาจาก ERP และที่เพิ่มเอง จัดการห้ามส่งได้ที่นี่
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/suppressions">รายชื่อห้ามส่งทั้งหมด</Link>
          </Button>
          <Button asChild>
            <Link href="/contacts/new">เพิ่มอีเมลเอง</Link>
          </Button>
        </div>
      </div>

      <ContactSyncCard />

      <div className="flex flex-wrap items-end gap-3">
        <NativeSelect
          className="w-48"
          aria-label="Database"
          value={filters.connectionId}
          onChange={(e) => setFilters((f) => ({ ...f, connectionId: e.target.value, page: 1 }))}
        >
          <option value="">ทุก database</option>
          {connections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-40"
          aria-label="ที่มา"
          value={filters.source}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              source: e.target.value as ContactFilters['source'],
              page: 1,
            }))
          }
        >
          <option value="">ทุกที่มา</option>
          <option value="ERP">จาก ERP</option>
          <option value="MANUAL">เพิ่มเอง</option>
        </NativeSelect>
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            className="w-72"
            placeholder="ค้นหาอีเมล, ชื่อ, แผนก"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        {data && (
          <span className="ml-auto text-sm text-muted-foreground">
            ทั้งหมด {data.total.toLocaleString('th-TH')} รายชื่อ
          </span>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>อีเมล</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>บริษัท / แผนก</TableHead>
            <TableHead>ที่มา</TableHead>
            <TableHead>การส่ง</TableHead>
            <TableHead>อัปเดตล่าสุด</TableHead>
            <TableHead />
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
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                ไม่พบรายชื่อ — กด &quot;ดึงรายชื่อผู้รับ&quot; ด้านบน หรือ &quot;เพิ่มอีเมลเอง&quot;
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((c) => (
            <TableRow key={c.id} className={isFetching ? 'opacity-60' : undefined}>
              <TableCell className="font-medium">{c.email ?? '—'}</TableCell>
              <TableCell>{c.name ?? '—'}</TableCell>
              <TableCell className="max-w-48">{c.company ?? '—'}</TableCell>
              <TableCell>
                {c.source === 'MANUAL' ? (
                  <Badge variant="secondary">เพิ่มเอง</Badge>
                ) : (
                  <Badge>ERP</Badge>
                )}
                {c.connectionName && (
                  <div className="mt-1 text-xs text-muted-foreground">{c.connectionName}</div>
                )}
              </TableCell>
              <TableCell>
                <SendToggle contact={c} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(c.syncedAt)}
              </TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                {c.source === 'MANUAL' && (
                  <>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/contacts/${c.id}`}>แก้ไข</Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => onDelete(c)}
                    >
                      ลบ
                    </Button>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={() => setTestTarget(c)}>
                  ส่งทดสอบ
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={filters.page <= 1}
          onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
        >
          ก่อนหน้า
        </Button>
        <span className="text-sm">
          หน้า {filters.page} / {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={filters.page >= pages}
          onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
        >
          ถัดไป
        </Button>
      </div>
      {testTarget && (
        <TestSendDialog
          key={testTarget.id}
          contact={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}
    </div>
  );
}
