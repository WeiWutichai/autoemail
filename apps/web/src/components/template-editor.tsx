'use client';

import type { MailTemplateDto, RenderTemplateInput } from '@erp-mail/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { CheckboxField } from '@/components/checkbox-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/error-messages';
import { formatDateTime } from '@/lib/format';
import { useSmtpConfigs } from '@/lib/smtp';
import {
  emptyTemplateForm,
  formFromTemplate,
  parseSample,
  toCreateTemplateInput,
  toUpdateTemplateInput,
  type TemplateForm,
} from '@/lib/template-form';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useTemplate,
  useTemplatePreview,
  useTemplateVersions,
  useTestSend,
  useUpdateTemplate,
} from '@/lib/templates';
import { useDebounced } from '@/lib/use-debounced';

const HELP = [
  ['{{order_no}}', 'ค่าจากคอลัมน์ order_no ของ query'],
  ['{{formatDate doc_date "long"}}', 'วันที่ (short / medium / long / iso)'],
  ['{{formatDateTime doc_date}}', 'วันที่และเวลา'],
  ['{{formatNumber amount 2}}', 'ตัวเลขมีคอมมา ทศนิยม 2 ตำแหน่ง'],
  ['{{default supplier_name "-"}}', 'ค่าแทนเมื่อว่าง'],
  ['{{#if approved}}…{{else}}…{{/if}}', 'เงื่อนไข'],
] as const;

function Preview({ form }: { form: TemplateForm }) {
  const [mode, setMode] = useState<'html' | 'text'>('html');
  const sample = parseSample(form.sample);
  const input: RenderTemplateInput | null = sample.ok
    ? {
        subjectTpl: form.subjectTpl,
        bodyHtmlTpl: form.bodyHtmlTpl,
        bodyTextTpl: form.bodyTextTpl.trim() ? form.bodyTextTpl : null,
        variables: sample.data,
      }
    : null;
  const debounced = useDebounced(input, 400);
  const { data, error } = useTemplatePreview(debounced);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">ตัวอย่าง</CardTitle>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={mode === 'html' ? 'secondary' : 'ghost'}
            onClick={() => setMode('html')}
          >
            HTML
          </Button>
          <Button
            size="sm"
            variant={mode === 'text' ? 'secondary' : 'ghost'}
            onClick={() => setMode('text')}
          >
            ข้อความ
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {!sample.ok && <p className="text-sm text-destructive">{sample.error}</p>}
        {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {data && (
          <>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">หัวเรื่อง: </span>
              {data.subject}
            </div>
            {mode === 'html' ? (
              <iframe
                title="ตัวอย่างอีเมล"
                sandbox=""
                srcDoc={data.html}
                className="h-96 w-full rounded-md border bg-white"
              />
            ) : (
              <pre className="h-96 overflow-auto whitespace-pre-wrap rounded-md border p-3 text-sm">
                {data.text}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TestSendCard({ template, form }: { template: MailTemplateDto; form: TemplateForm }) {
  const { data: smtpConfigs } = useSmtpConfigs();
  const testSend = useTestSend();
  const [to, setTo] = useState('');
  const [smtpId, setSmtpId] = useState('');

  const send = async () => {
    const sample = parseSample(form.sample);
    if (!sample.ok) return toast.error(sample.error);
    try {
      const res = await testSend.mutateAsync({
        id: template.id,
        input: { to: to.trim(), variables: sample.data, smtpConfigId: smtpId || undefined },
      });
      if (res.ok) toast.success(`ส่งเมลทดสอบถึง ${to.trim()} แล้ว`);
      else toast.error('ส่งไม่สำเร็จ', { description: res.error, duration: 15000 });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ส่งทดสอบ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          ส่งด้วย template เวอร์ชันที่บันทึกแล้ว (v{template.version}) และข้อมูลตัวอย่างด้านซ้าย
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="you@yourcompany.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          <NativeSelect
            className="w-48"
            aria-label="SMTP"
            value={smtpId}
            onChange={(e) => setSmtpId(e.target.value)}
          >
            <option value="">SMTP ค่าเริ่มต้น</option>
            {smtpConfigs?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <Button disabled={!to.trim() || testSend.isPending} onClick={send}>
            {testSend.isPending ? 'กำลังส่ง…' : 'ส่ง'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Versions({
  template,
  onLoad,
}: {
  template: MailTemplateDto;
  onLoad: (patch: Partial<TemplateForm>) => void;
}) {
  const { data: versions } = useTemplateVersions(template.id);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ประวัติเวอร์ชัน</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {versions?.map((v) => (
          <div key={v.version} className="flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <span className="font-medium">v{v.version}</span>{' '}
              <span className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</span>
              <div className="truncate font-mono text-xs text-muted-foreground">{v.subjectTpl}</div>
            </div>
            {v.version !== template.version && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  onLoad({
                    subjectTpl: v.subjectTpl,
                    bodyHtmlTpl: v.bodyHtmlTpl,
                    bodyTextTpl: v.bodyTextTpl ?? '',
                  })
                }
              >
                โหลดมาแก้
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Editor({ template }: { template: MailTemplateDto | null }) {
  const router = useRouter();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const [form, setForm] = useState<TemplateForm>(() =>
    template ? formFromTemplate(template) : emptyTemplateForm(),
  );
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<TemplateForm>) => setForm((f) => ({ ...f, ...patch }));

  const dirty = useMemo(() => {
    if (!template) return true;
    const res = toUpdateTemplateInput(form, template);
    return !res.ok || res.data !== null;
  }, [form, template]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (template) {
        const result = toUpdateTemplateInput(form, template);
        if (!result.ok) return setError(result.error);
        if (!result.data) return;
        const saved = await update.mutateAsync({ id: template.id, input: result.data });
        toast.success(
          saved.version !== template.version
            ? `บันทึกเป็นเวอร์ชัน v${saved.version} แล้ว`
            : 'บันทึกแล้ว',
        );
      } else {
        const result = toCreateTemplateInput(form);
        if (!result.ok) return setError(result.error);
        const saved = await create.mutateAsync(result.data);
        toast.success(`สร้าง ${saved.code} แล้ว`);
        router.replace(`/templates/${saved.id}`);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onDelete = async () => {
    if (!template) return;
    try {
      await remove.mutateAsync(template.id);
      toast.success(`ลบ ${template.code} แล้ว`);
      router.replace('/templates');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/templates" className="text-sm text-muted-foreground underline">
            ← Templates
          </Link>
          <h1 className="text-2xl font-semibold">
            {template ? `${template.code} (v${template.version})` : 'สร้าง template'}
          </h1>
        </div>
        {template && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            ลบ
          </Button>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tpl-code">รหัส</Label>
              <Input
                id="tpl-code"
                className="font-mono"
                placeholder="pr_pending"
                disabled={template !== null}
                value={form.code}
                onChange={(e) => set({ code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-name">ชื่อ</Label>
              <Input
                id="tpl-name"
                placeholder="แจ้งเตือน PR/PO รออนุมัติ"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-subject">หัวเรื่อง</Label>
            <Input
              id="tpl-subject"
              className="font-mono text-sm"
              value={form.subjectTpl}
              onChange={(e) => set({ subjectTpl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-html">เนื้อหา (HTML)</Label>
            <Textarea
              id="tpl-html"
              rows={16}
              spellCheck={false}
              className="font-mono text-xs"
              value={form.bodyHtmlTpl}
              onChange={(e) => set({ bodyHtmlTpl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-text">เนื้อหาแบบข้อความล้วน (ไม่บังคับ)</Label>
            <Textarea
              id="tpl-text"
              rows={4}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="เว้นว่าง = สร้างจาก HTML อัตโนมัติ"
              value={form.bodyTextTpl}
              onChange={(e) => set({ bodyTextTpl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-sample">ข้อมูลตัวอย่าง (JSON) สำหรับ preview และส่งทดสอบ</Label>
            <Textarea
              id="tpl-sample"
              rows={8}
              spellCheck={false}
              className="font-mono text-xs"
              value={form.sample}
              onChange={(e) => set({ sample: e.target.value })}
            />
          </div>
          <CheckboxField
            id="tpl-active"
            label="เปิดใช้งาน"
            checked={form.isActive}
            onChange={(isActive) => set({ isActive })}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={create.isPending || update.isPending || !dirty}>
              บันทึก
            </Button>
            {template && dirty && (
              <span className="text-xs text-muted-foreground">มีการแก้ไขที่ยังไม่บันทึก</span>
            )}
          </div>

          <div className="rounded-md border p-3 text-xs">
            <div className="mb-2 font-medium">ตัวแปรและ helper</div>
            <table className="w-full">
              <tbody>
                {HELP.map(([syntax, meaning]) => (
                  <tr key={syntax}>
                    <td className="py-0.5 pr-3 font-mono">{syntax}</td>
                    <td className="text-muted-foreground">{meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-muted-foreground">
              วันที่จาก ERP แสดงตามเวลาที่บันทึกใน ERP (ไม่แปลงเขตเวลา) และใช้ปี พ.ศ.
            </p>
          </div>
        </form>

        <div className="space-y-6">
          <Preview form={form} />
          {template && <TestSendCard template={template} form={form} />}
          {template && <Versions template={template} onLoad={set} />}
        </div>
      </div>
    </div>
  );
}

/** Create (`id` null) or edit a template. */
export function TemplateEditor({ id }: { id: string | null }) {
  const { data: template, isLoading, error } = useTemplate(id);
  if (id && isLoading) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (id && error) return <p className="text-destructive">{errorMessage(error)}</p>;
  return (
    <Editor
      key={template ? `${template.id}:${template.version}` : 'new'}
      template={template ?? null}
    />
  );
}
