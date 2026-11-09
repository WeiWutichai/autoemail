'use client';

import type { SmtpConfigDto } from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckboxField } from '@/components/checkbox-field';
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
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import {
  useCreateSmtpConfig,
  useDeleteSmtpConfig,
  useSmtpConfigs,
  useTestSmtp,
  useUpdateSmtpConfig,
} from '@/lib/smtp';
import {
  emptySmtpForm,
  formFromSmtp,
  toCreateSmtpInput,
  toUpdateSmtpInput,
  type SmtpForm,
} from '@/lib/smtp-form';

type DialogTarget = SmtpConfigDto | null | undefined;

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SmtpDialog({ target, onClose }: { target: DialogTarget; onClose: () => void }) {
  const create = useCreateSmtpConfig();
  const update = useUpdateSmtpConfig();
  const editing = target ?? null;
  const [form, setForm] = useState<SmtpForm>(() =>
    editing ? formFromSmtp(editing) : emptySmtpForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<SmtpForm>) => setForm((f) => ({ ...f, ...patch }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const result = toUpdateSmtpInput(form, editing);
        if (!result.ok) return setError(result.error);
        if (result.data) await update.mutateAsync({ id: editing.id, input: result.data });
      } else {
        const result = toCreateSmtpInput(form);
        if (!result.ok) return setError(result.error);
        await create.mutateAsync(result.data);
      }
      toast.success(`บันทึก ${form.name.trim()} แล้ว กด "ทดสอบ" เพื่อตรวจการเชื่อมต่อ`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข ${editing.name}` : 'เพิ่ม SMTP'}</DialogTitle>
            <DialogDescription>
              Google Workspace: ใช้ smtp.gmail.com port 587, username คืออีเมลที่ส่ง และรหัสผ่านคือ
              App Password 16 ตัวอักษร
            </DialogDescription>
          </DialogHeader>

          <Field id="smtp-name" label="ชื่อ">
            <Input
              id="smtp-name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field id="smtp-host" label="Host">
              <Input
                id="smtp-host"
                value={form.host}
                onChange={(e) => set({ host: e.target.value })}
              />
            </Field>
            <Field id="smtp-port" label="Port">
              <Input
                id="smtp-port"
                inputMode="numeric"
                value={form.port}
                onChange={(e) => set({ port: e.target.value })}
              />
            </Field>
          </div>
          <CheckboxField
            id="smtp-secure"
            label="เชื่อมต่อแบบ SSL ตั้งแต่ต้น (port 465)"
            hint="ปิดไว้สำหรับ port 587 — ระบบจะใช้ STARTTLS อัตโนมัติ"
            checked={form.secure}
            onChange={(secure) => set({ secure, port: secure ? '465' : '587' })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field id="smtp-user" label="Username">
              <Input
                id="smtp-user"
                autoComplete="off"
                placeholder="noreply@yourcompany.com"
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
              />
            </Field>
            <Field id="smtp-pass" label="Password / App Password">
              <Input
                id="smtp-pass"
                type="password"
                autoComplete="new-password"
                placeholder={editing?.hasPassword ? '•••••••• (เว้นว่าง = ใช้รหัสเดิม)' : ''}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="smtp-from-name" label="ชื่อผู้ส่ง">
              <Input
                id="smtp-from-name"
                value={form.fromName}
                onChange={(e) => set({ fromName: e.target.value })}
              />
            </Field>
            <Field id="smtp-from-email" label="อีเมลผู้ส่ง">
              <Input
                id="smtp-from-email"
                placeholder="noreply@yourcompany.com"
                value={form.fromEmail}
                onChange={(e) => set({ fromEmail: e.target.value })}
              />
            </Field>
          </div>
          <Field
            id="smtp-limit"
            label="เพดานการส่งต่อวัน"
            hint="Google Workspace ส่งได้ประมาณ 2,000 ฉบับต่อวันต่อบัญชี เมื่อถึงเพดานระบบจะรอส่งวันถัดไป"
          >
            <Input
              id="smtp-limit"
              inputMode="numeric"
              value={form.dailyLimit}
              onChange={(e) => set({ dailyLimit: e.target.value })}
            />
          </Field>
          <CheckboxField
            id="smtp-default"
            label="ใช้เป็นค่าเริ่มต้น"
            checked={form.isDefault}
            onChange={(isDefault) => set({ isDefault })}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              บันทึก
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({ target, onClose }: { target: SmtpConfigDto | null; onClose: () => void }) {
  const test = useTestSmtp();
  const [to, setTo] = useState('');

  const run = async (sendMail: boolean) => {
    if (!target) return;
    try {
      const res = await test.mutateAsync({
        id: target.id,
        input: sendMail ? { to: to.trim() } : {},
      });
      if (res.ok) {
        toast.success(
          sendMail
            ? `ส่งเมลทดสอบถึง ${to.trim()} แล้ว (${res.latencyMs} ms)`
            : `${target.name}: เข้าสู่ระบบ SMTP ได้ (${res.latencyMs} ms)`,
        );
        onClose();
      } else {
        toast.error(`${target.name}: ทดสอบไม่ผ่าน`, { description: res.error, duration: 15000 });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ทดสอบ {target?.name}</DialogTitle>
          <DialogDescription>
            ตรวจการเข้าสู่ระบบ SMTP หรือส่งเมลทดสอบไปยังอีเมลที่กรอก
          </DialogDescription>
        </DialogHeader>
        <Field id="smtp-test-to" label="ส่งเมลทดสอบถึง (ไม่บังคับ)">
          <Input
            id="smtp-test-to"
            type="email"
            placeholder="you@yourcompany.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={test.isPending} onClick={() => run(false)}>
            ตรวจการเข้าสู่ระบบ
          </Button>
          <Button disabled={test.isPending || !to.trim()} onClick={() => run(true)}>
            {test.isPending ? 'กำลังทดสอบ…' : 'ส่งเมลทดสอบ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SmtpPage() {
  const { data: configs, isLoading, error } = useSmtpConfigs();
  const update = useUpdateSmtpConfig();
  const remove = useDeleteSmtpConfig();
  const [dialogTarget, setDialogTarget] = useState<DialogTarget>(undefined);
  const [testTarget, setTestTarget] = useState<SmtpConfigDto | null>(null);

  const makeDefault = async (smtp: SmtpConfigDto) => {
    try {
      await update.mutateAsync({ id: smtp.id, input: { isDefault: true } });
      toast.success(`ใช้ ${smtp.name} เป็นค่าเริ่มต้นแล้ว`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const onDelete = async (smtp: SmtpConfigDto) => {
    try {
      await remove.mutateAsync(smtp.id);
      toast.success(`ลบ ${smtp.name} แล้ว`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">SMTP</h1>
          <p className="text-sm text-muted-foreground">
            บัญชีที่ใช้ส่งเมล — รหัสผ่านถูกเข้ารหัสก่อนบันทึกและไม่แสดงกลับมา
          </p>
        </div>
        <Button onClick={() => setDialogTarget(null)}>เพิ่ม SMTP</Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>Server</TableHead>
            <TableHead>ผู้ส่ง</TableHead>
            <TableHead>เพดาน/วัน</TableHead>
            <TableHead>ทดสอบล่าสุด</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
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
          {configs?.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                ยังไม่มี SMTP — กด &quot;เพิ่ม SMTP&quot; เพื่อเริ่มต้น
              </TableCell>
            </TableRow>
          )}
          {configs?.map((smtp) => (
            <TableRow key={smtp.id}>
              <TableCell className="font-medium">
                {smtp.name} {smtp.isDefault && <Badge className="ml-1">ค่าเริ่มต้น</Badge>}
              </TableCell>
              <TableCell>
                <div>
                  {smtp.host}:{smtp.port}
                </div>
                <div className="text-xs text-muted-foreground">
                  {smtp.username ?? 'ไม่ใช้การเข้าสู่ระบบ'}
                  {smtp.username && !smtp.hasPassword && ' · ไม่มีรหัสผ่าน'}
                </div>
              </TableCell>
              <TableCell>
                <div>{smtp.fromName}</div>
                <div className="text-xs text-muted-foreground">{smtp.fromEmail}</div>
              </TableCell>
              <TableCell>{smtp.dailyLimit.toLocaleString('th-TH')}</TableCell>
              <TableCell>
                {smtp.lastTestOk === null ? (
                  <span className="text-sm text-muted-foreground">ยังไม่ได้ทดสอบ</span>
                ) : (
                  <div className="space-y-1">
                    {smtp.lastTestOk ? (
                      <Badge>ผ่าน</Badge>
                    ) : (
                      <Badge variant="destructive">ล้มเหลว</Badge>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(smtp.lastTestAt)}
                    </div>
                  </div>
                )}
              </TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                <Button variant="outline" size="sm" onClick={() => setTestTarget(smtp)}>
                  ทดสอบ
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialogTarget(smtp)}>
                  แก้ไข
                </Button>
                {!smtp.isDefault && (
                  <Button variant="secondary" size="sm" onClick={() => makeDefault(smtp)}>
                    ตั้งเป็นค่าเริ่มต้น
                  </Button>
                )}
                {(!smtp.isDefault || configs.length === 1) && (
                  <Button variant="destructive" size="sm" onClick={() => onDelete(smtp)}>
                    ลบ
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {dialogTarget !== undefined && (
        <SmtpDialog
          key={dialogTarget?.id ?? 'new'}
          target={dialogTarget}
          onClose={() => setDialogTarget(undefined)}
        />
      )}
      {testTarget && (
        <TestDialog key={testTarget.id} target={testTarget} onClose={() => setTestTarget(null)} />
      )}
    </div>
  );
}
