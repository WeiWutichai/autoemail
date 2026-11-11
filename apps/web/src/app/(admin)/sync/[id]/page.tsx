'use client';

import Link from 'next/link';
import { SyncEditor } from '@/components/sync-editor';
import { errorMessage } from '@/lib/error-messages';
import { useSyncConfigs } from '@/lib/sync';

export default function EditSyncPage({ params }: { params: { id: string } }) {
  const { data: configs, isLoading, error } = useSyncConfigs();
  const config = configs?.find((c) => c.id === params.id);

  if (isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>;
  if (!config) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">ไม่พบการตั้งค่าดึงข้อมูลนี้</p>
        <Link href="/sync" className="text-sm underline">
          กลับไปหน้า Sync
        </Link>
      </div>
    );
  }
  // key: start a fresh form when switching between configs.
  return <SyncEditor key={config.id} config={config} />;
}
