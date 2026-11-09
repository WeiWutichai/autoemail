'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useTemplates } from '@/lib/templates';

export default function TemplatesPage() {
  const { data: templates, isLoading, error } = useTemplates();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground">
            template อีเมล ใช้ตัวแปรจากคอลัมน์ของ query เช่น {'{{order_no}}'}
          </p>
        </div>
        <Button asChild>
          <Link href="/templates/new">สร้าง template</Link>
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>หัวเรื่อง</TableHead>
            <TableHead>เวอร์ชัน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>แก้ไขล่าสุด</TableHead>
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
          {templates?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                ยังไม่มี template — กด &quot;สร้าง template&quot; เพื่อเริ่มต้น
              </TableCell>
            </TableRow>
          )}
          {templates?.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-mono text-sm">
                <Link href={`/templates/${t.id}`} className="underline">
                  {t.code}
                </Link>
              </TableCell>
              <TableCell>{t.name}</TableCell>
              <TableCell className="max-w-sm truncate font-mono text-xs">{t.subjectTpl}</TableCell>
              <TableCell>v{t.version}</TableCell>
              <TableCell>
                {t.isActive ? (
                  <Badge>ใช้งาน</Badge>
                ) : (
                  <Badge variant="secondary">ปิดการใช้งาน</Badge>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatDateTime(t.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
