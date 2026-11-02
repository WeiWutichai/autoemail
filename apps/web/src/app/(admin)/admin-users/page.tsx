'use client';

import { createAdminUserSchema, resetPasswordSchema, type AdminUserDto } from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAdminUsers,
  useCreateAdminUser,
  useResetAdminPassword,
  useUpdateAdminUser,
} from '@/lib/admin-users';
import { errorMessage } from '@/lib/error-messages';

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function AddAdminDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const create = useCreateAdminUser();
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = createAdminUserSchema.safeParse(form);
    if (!parsed.success) {
      setError('กรุณากรอกอีเมลให้ถูกต้อง ระบุชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร');
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success('เพิ่มผู้ดูแลระบบแล้ว');
      setForm({ email: '', name: '', password: '' });
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ดูแลระบบ</DialogTitle>
            <DialogDescription>
              ผู้ดูแลระบบใหม่จะเข้าสู่ระบบด้วยอีเมลและรหัสผ่านนี้
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-email">อีเมล</Label>
            <Input
              id="new-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-name">ชื่อ</Label>
            <Input
              id="new-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">รหัสผ่าน</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onClose,
}: {
  target: AdminUserDto | null;
  onClose: () => void;
}) {
  const reset = useResetAdminPassword();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) {
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    try {
      await reset.mutateAsync({ id: target.id, password: parsed.data.password });
      toast.success(`ตั้งรหัสผ่านใหม่ให้ ${target.email} แล้ว`);
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>รีเซ็ตรหัสผ่าน</DialogTitle>
            <DialogDescription>
              {target?.email} จะถูกออกจากระบบทุกอุปกรณ์ และต้องใช้รหัสผ่านใหม่นี้
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">รหัสผ่านใหม่</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={reset.isPending}>
              บันทึกรหัสผ่านใหม่
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { data: users, isLoading, error } = useAdminUsers();
  const update = useUpdateAdminUser();
  const [addOpen, setAddOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null);

  const toggleActive = async (u: AdminUserDto) => {
    try {
      await update.mutateAsync({ id: u.id, isActive: !u.isActive });
      toast.success(u.isActive ? `ปิดการใช้งาน ${u.email} แล้ว` : `เปิดการใช้งาน ${u.email} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ผู้ดูแลระบบ</h1>
        <Button onClick={() => setAddOpen(true)}>เพิ่มผู้ดูแลระบบ</Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>อีเมล</TableHead>
            <TableHead>ชื่อ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>เข้าสู่ระบบล่าสุด</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {users?.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.name}</TableCell>
              <TableCell>
                {u.isActive ? (
                  <Badge>ใช้งาน</Badge>
                ) : (
                  <Badge variant="secondary">ปิดการใช้งาน</Badge>
                )}
              </TableCell>
              <TableCell>{u.lastLoginAt ? dateFmt.format(new Date(u.lastLoginAt)) : '—'}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                  รีเซ็ตรหัสผ่าน
                </Button>
                <Button
                  variant={u.isActive ? 'destructive' : 'secondary'}
                  size="sm"
                  disabled={u.id === me.id || update.isPending}
                  onClick={() => toggleActive(u)}
                >
                  {u.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AddAdminDialog open={addOpen} onOpenChange={setAddOpen} />
      <ResetPasswordDialog target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  );
}
