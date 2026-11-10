'use client';

import {
  DB_TYPES,
  type DbType,
  type ErpConnectionDto,
  type TestConnectionResult,
} from '@erp-mail/shared';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
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
  changeDbType,
  DB_TYPE_LABELS,
  emptyConnectionForm,
  formFromConnection,
  toCreateInput,
  toTestDraftInput,
  toUpdateInput,
  type ConnectionForm,
} from '@/lib/connection-form';
import {
  useConnections,
  useCreateConnection,
  useDeleteConnection,
  useTestConnection,
  useTestConnectionDraft,
  useUpdateConnection,
} from '@/lib/connections';
import { errorMessage } from '@/lib/error-messages';

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

/** `undefined` = closed, `null` = create, otherwise edit that connection. */
type DialogTarget = ErpConnectionDto | null | undefined;

function Checkbox({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function ConnectionDialog({ target, onClose }: { target: DialogTarget; onClose: () => void }) {
  const create = useCreateConnection();
  const update = useUpdateConnection();
  const editing = target ?? null;
  const [form, setForm] = useState<ConnectionForm>(() =>
    editing ? formFromConnection(editing) : emptyConnectionForm(),
  );
  const testDraft = useTestConnectionDraft();
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const set = (patch: Partial<ConnectionForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setTestResult(null);
  };
  const pending = create.isPending || update.isPending;

  const onTest = async () => {
    setError(null);
    setTestResult(null);
    const result = toTestDraftInput(form, editing?.id);
    if (!result.ok) return setError(result.error);
    try {
      setTestResult(await testDraft.mutateAsync(result.data));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const result = toUpdateInput(form, editing);
        if (!result.ok) return setError(result.error);
        if (result.data) await update.mutateAsync({ id: editing.id, input: result.data });
        toast.success(`บันทึก ${form.name.trim()} แล้ว`);
      } else {
        const result = toCreateInput(form);
        if (!result.ok) return setError(result.error);
        await create.mutateAsync(result.data);
        toast.success(`เพิ่ม ${result.data.name} แล้ว กด "ทดสอบ" เพื่อตรวจการเชื่อมต่อ`);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const isMssql = form.dbType === 'MSSQL';

  return (
    <Dialog open={target !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข ${editing.name}` : 'เพิ่ม connection'}</DialogTitle>
            <DialogDescription>
              ข้อมูลเชื่อมต่อฐานข้อมูล ERP — รหัสผ่านจะถูกเข้ารหัสก่อนบันทึก และไม่แสดงกลับมาอีก
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="conn-name">ชื่อ connection</Label>
            <Input
              id="conn-name"
              placeholder="เช่น ERP-HQ"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="conn-type">ประเภทฐานข้อมูล</Label>
            <select
              id="conn-type"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={form.dbType}
              onChange={(e) => {
                setForm((f) => changeDbType(f, e.target.value as DbType));
                setTestResult(null);
              }}
            >
              {DB_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DB_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="conn-host">Host</Label>
              <Input
                id="conn-host"
                placeholder={isMssql ? '192.168.1.10 หรือ SERVER\\SQLEXPRESS' : '192.168.1.10'}
                value={form.host}
                onChange={(e) => set({ host: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-port">Port</Label>
              <Input
                id="conn-port"
                inputMode="numeric"
                value={form.port}
                onChange={(e) => set({ port: e.target.value })}
              />
            </div>
          </div>
          {isMssql && (
            <p className="-mt-2 text-xs text-muted-foreground">
              ถ้าใช้ named instance ให้ใส่ชื่อ instance ต่อท้าย host (เช่น SERVER\SQLEXPRESS)
              ระบบจะไม่ใช้ port และต้องเปิด SQL Server Browser (UDP 1434) —
              ถ้าเชื่อมต่อผ่านอินเทอร์เน็ต แนะนำให้ใส่แค่ IP กับ port ของ instance แทน
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="conn-db">
              {form.dbType === 'ORACLE' ? 'Service name' : 'Database'}
            </Label>
            <Input
              id="conn-db"
              value={form.database}
              onChange={(e) => set({ database: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="conn-user">Username</Label>
              <Input
                id="conn-user"
                autoComplete="off"
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-password">Password</Label>
              <Input
                id="conn-password"
                type="password"
                autoComplete="new-password"
                placeholder={editing?.hasPassword ? '•••••••• (เว้นว่าง = ใช้รหัสเดิม)' : ''}
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            แนะนำให้ใช้ user ที่มีสิทธิ์ SELECT อย่างเดียว
          </p>

          <div className="space-y-3 rounded-md border p-3">
            <Checkbox
              id="conn-ssl"
              label="เข้ารหัสการเชื่อมต่อ (SSL/TLS)"
              checked={form.ssl}
              onChange={(ssl) => set({ ssl })}
            />
            <Checkbox
              id="conn-trust"
              label="เชื่อถือ certificate ของ server"
              hint="เปิดเมื่อ server ใช้ certificate ที่ออกเอง (self-signed) ซึ่งพบบ่อยใน SQL Server ภายในองค์กร"
              checked={form.trustServerCert}
              onChange={(trustServerCert) => set({ trustServerCert })}
            />
            <Checkbox
              id="conn-active"
              label="เปิดใช้งาน"
              checked={form.isActive}
              onChange={(isActive) => set({ isActive })}
            />
          </div>

          {testResult && (
            <div
              role="status"
              className={
                testResult.ok
                  ? 'rounded-md border border-primary/30 bg-primary/5 p-3 text-sm'
                  : 'rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'
              }
            >
              {testResult.ok ? (
                <p className="font-medium">เชื่อมต่อได้ ({testResult.latencyMs} ms)</p>
              ) : (
                <>
                  <p className="font-medium text-destructive">เชื่อมต่อไม่ได้</p>
                  {testResult.error && (
                    <p className="mt-1 break-words text-muted-foreground">{testResult.error}</p>
                  )}
                </>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              disabled={testDraft.isPending}
              onClick={onTest}
            >
              {testDraft.isPending ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onClose}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={pending}>
                บันทึก
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  target,
  onClose,
}: {
  target: ErpConnectionDto | null;
  onClose: () => void;
}) {
  const remove = useDeleteConnection();
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const onConfirm = async () => {
    if (!target) return;
    try {
      await remove.mutateAsync(target.id);
      toast.success(`ลบ ${target.name} แล้ว`);
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ลบ {target?.name}?</DialogTitle>
          <DialogDescription>
            ลบได้เฉพาะ connection ที่ยังไม่มีการตั้งค่าดึงข้อมูลหรือประวัติเมลผูกอยู่
            ลบแล้วกู้คืนไม่ได้
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            ยกเลิก
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={onConfirm}>
            ลบ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestStatus({ conn }: { conn: ErpConnectionDto }) {
  if (conn.lastTestOk === null) {
    return <span className="text-sm text-muted-foreground">ยังไม่ได้ทดสอบ</span>;
  }
  return (
    <div className="space-y-1">
      {conn.lastTestOk ? <Badge>เชื่อมต่อได้</Badge> : <Badge variant="destructive">ล้มเหลว</Badge>}
      {conn.lastTestAt && (
        <div className="text-xs text-muted-foreground">
          {dateFmt.format(new Date(conn.lastTestAt))}
        </div>
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  const { data: connections, isLoading, error } = useConnections();
  const update = useUpdateConnection();
  const test = useTestConnection();
  const [dialogTarget, setDialogTarget] = useState<DialogTarget>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ErpConnectionDto | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const runTest = async (conn: ErpConnectionDto) => {
    setTestingId(conn.id);
    try {
      const result = await test.mutateAsync(conn.id);
      if (result.ok) {
        toast.success(`${conn.name}: เชื่อมต่อได้ (${result.latencyMs} ms)`);
      } else {
        toast.error(`${conn.name}: เชื่อมต่อไม่ได้`, {
          description: result.error,
          duration: 15000,
        });
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTestingId(null);
    }
  };

  const toggleActive = async (conn: ErpConnectionDto) => {
    try {
      await update.mutateAsync({ id: conn.id, input: { isActive: !conn.isActive } });
      toast.success(
        conn.isActive ? `ปิดการใช้งาน ${conn.name} แล้ว` : `เปิดการใช้งาน ${conn.name} แล้ว`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Connections</h1>
          <p className="text-sm text-muted-foreground">
            ฐานข้อมูล ERP ที่ระบบจะดึงรายการไปส่งเมล เพิ่มได้หลาย connection
          </p>
        </div>
        <Button onClick={() => setDialogTarget(null)}>เพิ่ม connection</Button>
      </div>

      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>Server / Database</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ทดสอบล่าสุด</TableHead>
            <TableHead className="text-right">การจัดการ</TableHead>
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
          {connections?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                ยังไม่มี connection — กด &quot;เพิ่ม connection&quot; เพื่อเริ่มต้น
              </TableCell>
            </TableRow>
          )}
          {connections?.map((conn) => (
            <TableRow key={conn.id}>
              <TableCell className="font-medium">{conn.name}</TableCell>
              <TableCell>{DB_TYPE_LABELS[conn.dbType]}</TableCell>
              <TableCell>
                <div>
                  {conn.host}
                  {conn.dbType === 'MSSQL' && conn.host.includes('\\') ? '' : `:${conn.port}`}
                </div>
                <div className="text-xs text-muted-foreground">{conn.database}</div>
              </TableCell>
              <TableCell>
                <div>{conn.username}</div>
                {!conn.hasPassword && (
                  <div className="text-xs text-muted-foreground">ไม่มีรหัสผ่าน</div>
                )}
              </TableCell>
              <TableCell>
                {conn.isActive ? (
                  <Badge>ใช้งาน</Badge>
                ) : (
                  <Badge variant="secondary">ปิดการใช้งาน</Badge>
                )}
              </TableCell>
              <TableCell>
                <TestStatus conn={conn} />
              </TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testingId !== null}
                  onClick={() => runTest(conn)}
                >
                  {testingId === conn.id ? 'กำลังทดสอบ…' : 'ทดสอบ'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialogTarget(conn)}>
                  แก้ไข
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => toggleActive(conn)}
                >
                  {conn.isActive ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(conn)}>
                  ลบ
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {dialogTarget !== undefined && (
        <ConnectionDialog
          key={dialogTarget?.id ?? 'new'}
          target={dialogTarget}
          onClose={() => setDialogTarget(undefined)}
        />
      )}
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}
