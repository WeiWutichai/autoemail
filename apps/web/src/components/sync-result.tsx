import type { SyncConfigDto, SyncRunResponse } from '@erp-mail/shared';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/format';

/** Last run summary shown in tables. */
export function SyncStatus({ config }: { config: SyncConfigDto }) {
  if (!config.lastSyncedAt) {
    return <span className="text-sm text-muted-foreground">ยังไม่เคยดึง</span>;
  }
  const r = config.lastResult;
  return (
    <div className="space-y-1 text-sm">
      {config.lastError ? (
        <Badge variant="destructive" title={config.lastError}>
          ล้มเหลว
        </Badge>
      ) : (
        <Badge>สำเร็จ</Badge>
      )}
      <div className="text-xs text-muted-foreground">{formatDateTime(config.lastSyncedAt)}</div>
      {config.lastError ? (
        <div className="max-w-xs truncate text-xs text-destructive" title={config.lastError}>
          {config.lastError}
        </div>
      ) : (
        r && (
          <div className="text-xs text-muted-foreground">
            ดึง {r.fetched} · ใหม่ {r.created} · อัปเดต {r.updated}
            {r.errors > 0 && <span className="text-destructive"> · ผิดพลาด {r.errors}</span>}
          </div>
        )
      )}
    </div>
  );
}

/** Toast for a "Sync now" response. */
export function toastSyncResult(name: string, res: SyncRunResponse): void {
  if (!res.ok || !res.result) {
    toast.error(`${name}: ดึงข้อมูลไม่สำเร็จ`, { description: res.error, duration: 15000 });
    return;
  }
  const r = res.result;
  const summary = `ดึง ${r.fetched} แถว · ใหม่ ${r.created} · อัปเดต ${r.updated} · ข้าม ${r.skipped}`;
  if (r.errors > 0) {
    toast.warning(`${name}: ${summary} · ผิดพลาด ${r.errors}`, {
      description: r.messages.join('\n'),
      duration: 15000,
    });
  } else {
    toast.success(`${name}: ${summary}`);
  }
}
