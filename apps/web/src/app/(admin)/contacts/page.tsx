'use client';

import type { ContactDto, SyncConfigDto } from '@erp-mail/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SyncStatus, toastSyncResult } from '@/components/sync-result';
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
import { useContacts, type ContactFilters } from '@/lib/contacts';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { useRunSync, useSyncConfigs } from '@/lib/sync';
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
  const [runningId, setRunningId] = useState<string | null>(null);
  const contactConfigs = configs?.filter((c) => c.kind === 'CONTACTS') ?? [];

  const runNow = async (config: SyncConfigDto) => {
    setRunningId(config.id);
    try {
      toastSyncResult(config.name, await run.mutateAsync(config.id));
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
      </CardHeader>
      <CardContent className="space-y-3">
        {contactConfigs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีการตั้งค่าดึงรายชื่อ — ไปที่{' '}
            <Link href="/sync" className="underline">
              Sync
            </Link>{' '}
            เพื่อเพิ่ม
          </p>
        )}
        {contactConfigs.map((config) => (
          <div key={config.id} className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium">
                {config.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({config.connectionName})
                </span>
              </div>
              <SyncStatus config={config} />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={runningId !== null || !config.isActive}
              onClick={() => runNow(config)}
            >
              {runningId === config.id ? 'กำลังดึง…' : 'Sync now'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ContactsPage() {
  const { data: connections } = useConnections();
  const [filters, setFilters] = useState<ContactFilters>({ connectionId: '', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const [testTarget, setTestTarget] = useState<ContactDto | null>(null);
  const { data, isLoading, isFetching, error } = useContacts(filters);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: search.trim(), page: 1 }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <p className="text-sm text-muted-foreground">รายชื่อที่ดึงมาจาก ERP</p>
      </div>

      <ContactSyncCard />

      <div className="flex flex-wrap items-end gap-3">
        <NativeSelect
          className="w-56"
          aria-label="Connection"
          value={filters.connectionId}
          onChange={(e) => setFilters((f) => ({ ...f, connectionId: e.target.value, page: 1 }))}
        >
          <option value="">ทุก connection</option>
          {connections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            className="w-72"
            placeholder="ค้นหาชื่อ, อีเมล, บริษัท, รหัส ERP"
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
            <TableHead>ชื่อ</TableHead>
            <TableHead>อีเมล</TableHead>
            <TableHead>บริษัท / แผนก</TableHead>
            <TableHead>โทรศัพท์</TableHead>
            <TableHead>รหัส ERP</TableHead>
            <TableHead>Connection</TableHead>
            <TableHead>ดึงล่าสุด</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                ไม่พบรายชื่อ
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((c) => (
            <TableRow key={c.id} className={isFetching ? 'opacity-60' : undefined}>
              <TableCell className="font-medium">{c.name ?? '—'}</TableCell>
              <TableCell>{c.email ?? '—'}</TableCell>
              <TableCell>{c.company ?? '—'}</TableCell>
              <TableCell>{c.phone ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs">{c.erpRefId}</TableCell>
              <TableCell>{c.connectionName}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(c.syncedAt)}
              </TableCell>
              <TableCell className="text-right">
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
