'use client';

import {
  MAIL_STATUSES,
  type MailEvent,
  type MailStatus,
  type MailStatusFilter,
} from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useConnections } from '@/lib/connections';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import {
  emptyMailFilters,
  useMail,
  useMailAction,
  useMails,
  useMailStats,
  type MailFilters,
} from '@/lib/mails';
import { useTemplates } from '@/lib/templates';

const STATUS_LABELS: Record<MailStatus, string> = {
  PENDING: 'รอส่ง',
  SENDING: 'กำลังส่ง',
  SENT: 'ส่งแล้ว',
  FAILED: 'รอลองใหม่',
  DEAD: 'ส่งไม่สำเร็จ',
  CANCELLED: 'ยกเลิก',
};

const STATUS_VARIANTS: Record<MailStatus, BadgeProps['variant']> = {
  PENDING: 'secondary',
  SENDING: 'secondary',
  SENT: 'default',
  FAILED: 'outline',
  DEAD: 'destructive',
  CANCELLED: 'outline',
};

const EVENT_LABELS: Record<MailEvent, string> = {
  QUEUED: 'เข้าคิว',
  SENDING: 'เริ่มส่ง',
  SENT: 'ส่งสำเร็จ',
  FAILED: 'ส่งล้มเหลว',
  RETRY: 'ลองใหม่ / เลื่อน',
  DEAD: 'หยุดลองส่ง',
  CANCELLED: 'ยกเลิก',
};

function StatusBadge({ status }: { status: MailStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

function Stat({
  label,
  value,
  hint,
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  active?: boolean;
  /** Set for cards that filter the table below. */
  onClick?: () => void;
}) {
  const body = (
    <Card
      className={`h-full ${onClick ? 'transition-colors hover:border-primary' : ''} ${
        active ? 'border-primary ring-1 ring-primary' : ''
      }`}
    >
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
  if (!onClick) return body;
  return (
    <button type="button" className="text-left" aria-pressed={active} onClick={onClick}>
      {body}
    </button>
  );
}

/** Today as yyyy-mm-dd in the browser's time zone (the format of the date filters). */
function today(): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The table filter each clickable card applies. */
const CARD_FILTERS = {
  sent: () => ({ status: 'SENT' as const, from: today(), to: today() }),
  waiting: () => ({ status: 'WAITING' as const, from: '', to: '' }),
  dead: () => ({ status: 'DEAD' as const, from: '', to: '' }),
};
type CardKey = keyof typeof CARD_FILTERS;

function cardOf(f: MailFilters): CardKey | null {
  const key = (Object.keys(CARD_FILTERS) as CardKey[]).find((k) => {
    const want = CARD_FILTERS[k]();
    return f.status === want.status && f.from === want.from && f.to === want.to;
  });
  return key ?? null;
}

function Dashboard({
  filters,
  onFilter,
}: {
  filters: MailFilters;
  onFilter: (patch: Partial<MailFilters>) => void;
}) {
  const { data } = useMailStats();
  const n = (v: number | undefined) => (v === undefined ? '—' : v.toLocaleString('th-TH'));
  const quota = data?.quotas.find((q) => q.isDefault) ?? data?.quotas[0];
  const active = cardOf(filters);
  // Clicking the active card again clears its filter.
  const pick = (key: CardKey) => () =>
    onFilter(active === key ? { status: '', from: '', to: '' } : CARD_FILTERS[key]());
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Stat
        label="ส่งสำเร็จวันนี้"
        value={n(data?.sentToday)}
        hint="กดเพื่อดูรายการ"
        active={active === 'sent'}
        onClick={pick('sent')}
      />
      <Stat
        label="ส่งล้มเหลววันนี้ (ครั้ง)"
        value={n(data?.failedToday)}
        hint="นับทุกครั้งที่ลองส่ง"
      />
      <Stat
        label="รอส่ง"
        value={n(data?.waiting)}
        hint="รวมกำลังส่งและรอลองใหม่ · กดเพื่อดูรายการ"
        active={active === 'waiting'}
        onClick={pick('waiting')}
      />
      <Stat
        label="ส่งไม่สำเร็จ (DEAD)"
        value={n(data?.dead)}
        hint="กดเพื่อดูรายการและ Retry"
        active={active === 'dead'}
        onClick={pick('dead')}
      />
      <Stat
        label="โควตาวันนี้"
        value={quota ? `${n(quota.used)} / ${n(quota.limit)}` : '—'}
        hint={quota ? quota.name : 'ยังไม่มี SMTP'}
      />
    </div>
  );
}

function MailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: mail, error } = useMail(id);
  const action = useMailAction();
  const [view, setView] = useState<'html' | 'text'>('html');

  const run = async (kind: 'retry' | 'cancel') => {
    try {
      await action.mutateAsync({ id, action: kind });
      toast.success(kind === 'retry' ? 'นำเมลกลับเข้าคิวแล้ว' : 'ยกเลิกเมลแล้ว');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6">{mail?.subject ?? 'รายละเอียดเมล'}</DialogTitle>
          <DialogDescription>
            {mail ? `ถึง ${mail.toAddrs.join(', ')}` : 'กำลังโหลด…'}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {mail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge status={mail.status} />
              <span>ส่งแล้ว {mail.attempts} ครั้ง</span>
              {mail.nextRetryAt && <span>ลองใหม่ {formatDateTime(mail.nextRetryAt)}</span>}
              <div className="ml-auto flex gap-2">
                {(mail.status === 'FAILED' || mail.status === 'DEAD') && (
                  <Button size="sm" disabled={action.isPending} onClick={() => run('retry')}>
                    Retry
                  </Button>
                )}
                {(mail.status === 'PENDING' || mail.status === 'FAILED') && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => run('cancel')}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">รหัส ERP</dt>
              <dd className="font-mono text-xs">{mail.erpRefId ?? '— (ส่งทดสอบ)'}</dd>
              <dt className="text-muted-foreground">Connection</dt>
              <dd>{mail.connectionName ?? '—'}</dd>
              <dt className="text-muted-foreground">Template</dt>
              <dd>
                {mail.templateCode ?? '—'}
                {mail.templateVersion !== null && ` (v${mail.templateVersion})`}
              </dd>
              <dt className="text-muted-foreground">SMTP</dt>
              <dd>{mail.smtpConfigName ?? 'ค่าเริ่มต้น'}</dd>
              {mail.cc.length > 0 && (
                <>
                  <dt className="text-muted-foreground">CC</dt>
                  <dd>{mail.cc.join(', ')}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Message ID</dt>
              <dd className="break-all font-mono text-xs">{mail.messageId ?? '—'}</dd>
              {mail.lastError && (
                <>
                  <dt className="text-muted-foreground">ข้อผิดพลาดล่าสุด</dt>
                  <dd className="text-destructive">{mail.lastError}</dd>
                </>
              )}
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-medium">ลำดับเหตุการณ์</h3>
              <ol className="space-y-2 border-l pl-4">
                {mail.logs.map((log) => (
                  <li key={log.id} className="text-sm">
                    <span className="font-medium">{EVENT_LABELS[log.event]}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </span>
                    {log.detail && (
                      <div className="text-xs text-muted-foreground">{log.detail}</div>
                    )}
                    {log.smtpResponse && (
                      <div className="break-all font-mono text-xs">{log.smtpResponse}</div>
                    )}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-medium">เนื้อหาที่ส่ง</h3>
                <Button
                  size="sm"
                  variant={view === 'html' ? 'secondary' : 'ghost'}
                  onClick={() => setView('html')}
                >
                  HTML
                </Button>
                <Button
                  size="sm"
                  variant={view === 'text' ? 'secondary' : 'ghost'}
                  onClick={() => setView('text')}
                >
                  ข้อความ
                </Button>
              </div>
              {mail.contentRemoved ? (
                <p className="text-sm text-muted-foreground">
                  เนื้อหาถูกลบแล้ว (เกินระยะเก็บข้อมูล หรือมีคำขอลบข้อมูลตาม PDPA)
                </p>
              ) : view === 'html' ? (
                <iframe
                  title="เนื้อหาเมล"
                  sandbox=""
                  srcDoc={mail.html ?? ''}
                  className="h-80 w-full rounded-md border bg-white"
                />
              ) : (
                <pre className="h-80 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-sm">
                  {mail.text}
                </pre>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function LogsPage() {
  const { data: connections } = useConnections();
  const { data: templates } = useTemplates();
  const [filters, setFilters] = useState<MailFilters>(emptyMailFilters);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, isFetching, error } = useMails(filters);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const setFilter = (patch: Partial<MailFilters>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setFilter({ q: search.trim() });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Logs</h1>
        <p className="text-sm text-muted-foreground">
          เมลทุกฉบับในคิวและผลการส่ง — อัปเดตอัตโนมัติทุก 15 วินาที
        </p>
      </div>

      <Dashboard filters={filters} onFilter={setFilter} />

      <div className="flex flex-wrap items-end gap-3">
        <NativeSelect
          className="w-52"
          aria-label="สถานะ"
          value={filters.status}
          onChange={(e) => setFilter({ status: e.target.value as MailStatusFilter | '' })}
        >
          <option value="">ทุกสถานะ</option>
          <option value="WAITING">รอส่งทั้งหมด (รวมรอลองใหม่)</option>
          {MAIL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          aria-label="Connection"
          value={filters.connectionId}
          onChange={(e) => setFilter({ connectionId: e.target.value })}
        >
          <option value="">ทุก connection</option>
          {connections?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-44"
          aria-label="Template"
          value={filters.templateId}
          onChange={(e) => setFilter({ templateId: e.target.value })}
        >
          <option value="">ทุก template</option>
          {templates?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="date"
          aria-label="ตั้งแต่วันที่"
          className="w-40"
          value={filters.from}
          onChange={(e) => setFilter({ from: e.target.value })}
        />
        <Input
          type="date"
          aria-label="ถึงวันที่"
          className="w-40"
          value={filters.to}
          onChange={(e) => setFilter({ to: e.target.value })}
        />
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            className="w-64"
            placeholder="อีเมลผู้รับ, รหัส ERP, หัวเรื่อง"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            ค้นหา
          </Button>
        </form>
        <Button
          variant="ghost"
          onClick={() => {
            setSearch('');
            setFilters(emptyMailFilters);
          }}
        >
          ล้างตัวกรอง
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา</TableHead>
            <TableHead>ผู้รับ</TableHead>
            <TableHead>หัวเรื่อง</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">ครั้งที่ส่ง</TableHead>
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
                ไม่พบเมล
              </TableCell>
            </TableRow>
          )}
          {data?.items.map((m) => (
            <TableRow
              key={m.id}
              className={`cursor-pointer ${isFetching ? 'opacity-60' : ''}`}
              onClick={() => setOpenId(m.id)}
            >
              <TableCell className="whitespace-nowrap text-xs">
                <div>{formatDateTime(m.createdAt)}</div>
                {m.sentAt && (
                  <div className="text-muted-foreground">ส่ง {formatDateTime(m.sentAt)}</div>
                )}
              </TableCell>
              <TableCell className="max-w-[14rem] truncate">{m.toAddrs.join(', ')}</TableCell>
              <TableCell className="max-w-md">
                <div className="truncate">{m.subject ?? '—'}</div>
                {m.lastError && m.status !== 'SENT' && (
                  <div className="truncate text-xs text-destructive">{m.lastError}</div>
                )}
              </TableCell>
              <TableCell className="text-xs">
                {m.templateCode ?? '—'}
                {m.connectionName === null && <div className="text-muted-foreground">ส่งทดสอบ</div>}
              </TableCell>
              <TableCell>
                <StatusBadge status={m.status} />
              </TableCell>
              <TableCell className="text-right">{m.attempts}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-end gap-2">
        {data && (
          <span className="mr-auto text-sm text-muted-foreground">
            ทั้งหมด {data.total.toLocaleString('th-TH')} ฉบับ
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={filters.page <= 1}
          onClick={() => setFilter({ page: filters.page - 1 })}
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
          onClick={() => setFilter({ page: filters.page + 1 })}
        >
          ถัดไป
        </Button>
      </div>

      {openId && <MailDrawer key={openId} id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
