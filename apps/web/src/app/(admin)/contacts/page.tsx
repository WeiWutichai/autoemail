'use client';

import type { SyncConfigDto } from '@erp-mail/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SyncStatus, toastSyncResult } from '@/components/sync-result';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useConnections } from '@/lib/connections';
import { useContacts, type ContactFilters } from '@/lib/contacts';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { useRunSync, useSyncConfigs } from '@/lib/sync';

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
    </div>
  );
}
