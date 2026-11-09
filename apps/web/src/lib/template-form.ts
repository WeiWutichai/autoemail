import {
  createMailTemplateSchema,
  updateMailTemplateSchema,
  type CreateMailTemplateInput,
  type MailTemplateDto,
  type TemplateVariables,
  type UpdateMailTemplateInput,
} from '@erp-mail/shared';

export interface TemplateForm {
  code: string;
  name: string;
  subjectTpl: string;
  bodyHtmlTpl: string;
  bodyTextTpl: string;
  /** JSON object text. */
  sample: string;
  isActive: boolean;
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Starter template matching docs/erp-queries/pr-po-pending-approval.sql. */
export const PR_PO_STARTER: Omit<TemplateForm, 'code' | 'name' | 'isActive'> = {
  subjectTpl: '[รออนุมัติ] {{doc_type}} {{order_no}} - {{supplier_name}}',
  bodyHtmlTpl: `<p>เรียน แผนก{{department}}</p>
<p>มีเอกสาร <b>{{doc_type}}</b> รอการอนุมัติ ดังนี้</p>
<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">
  <tr><td><b>เลขที่เอกสาร</b></td><td>{{order_no}}</td></tr>
  <tr><td><b>วันที่</b></td><td>{{formatDate doc_date "long"}}</td></tr>
  <tr><td><b>ผู้ขาย</b></td><td>{{supplier_code}} {{supplier_name}}</td></tr>
  <tr><td><b>สถานะ</b></td><td>{{status}}</td></tr>
</table>
<p>กรุณาเข้าระบบ ERP เพื่อพิจารณาอนุมัติ</p>
<p style="color:#888;font-size:12px">อีเมลนี้ส่งอัตโนมัติจาก ERP Mail Relay กรุณาอย่าตอบกลับ</p>`,
  bodyTextTpl: '',
  sample: JSON.stringify(
    {
      doc_type: 'PR',
      status: 'รอการอนุมัติ',
      order_no: 'PR6911-0001',
      doc_date: '2026-11-09T00:00:00.000Z',
      supplier_code: 'S001',
      supplier_name: 'บริษัท ตัวอย่าง จำกัด',
      dept_code: 'PUR',
      department: 'จัดซื้อ',
    },
    null,
    2,
  ),
};

export function emptyTemplateForm(): TemplateForm {
  return { code: '', name: '', isActive: true, ...PR_PO_STARTER };
}

export function formFromTemplate(t: MailTemplateDto): TemplateForm {
  return {
    code: t.code,
    name: t.name,
    subjectTpl: t.subjectTpl,
    bodyHtmlTpl: t.bodyHtmlTpl,
    bodyTextTpl: t.bodyTextTpl ?? '',
    sample: t.sampleVariables ? JSON.stringify(t.sampleVariables, null, 2) : '{}',
    isActive: t.isActive,
  };
}

export function parseSample(text: string): FormResult<TemplateVariables> {
  if (!text.trim()) return { ok: true, data: {} };
  try {
    const value: unknown = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ok: true, data: value as TemplateVariables };
    }
  } catch {
    // fall through
  }
  return { ok: false, error: 'ข้อมูลตัวอย่างต้องเป็น JSON object เช่น {"order_no": "PR-001"}' };
}

const FIELD_ERRORS: Record<string, string> = {
  code: 'รหัสใช้ได้เฉพาะ a-z, 0-9, _ และ - (ขึ้นต้นด้วยตัวอักษรหรือตัวเลข)',
  name: 'กรุณากรอกชื่อ',
  subjectTpl: 'กรุณากรอกหัวเรื่อง',
  bodyHtmlTpl: 'กรุณากรอกเนื้อหา HTML',
};

function firstError(issues: { path: (string | number)[] }[]): string {
  return FIELD_ERRORS[String(issues[0]?.path[0] ?? '')] ?? 'ข้อมูลไม่ถูกต้อง';
}

export function toCreateTemplateInput(form: TemplateForm): FormResult<CreateMailTemplateInput> {
  const sample = parseSample(form.sample);
  if (!sample.ok) return sample;
  const parsed = createMailTemplateSchema.safeParse({
    code: form.code,
    name: form.name,
    subjectTpl: form.subjectTpl,
    bodyHtmlTpl: form.bodyHtmlTpl,
    bodyTextTpl: form.bodyTextTpl.trim() ? form.bodyTextTpl : null,
    sampleVariables: sample.data,
    isActive: form.isActive,
  });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}

export function toUpdateTemplateInput(
  form: TemplateForm,
  original: MailTemplateDto,
): FormResult<UpdateMailTemplateInput | null> {
  const sample = parseSample(form.sample);
  if (!sample.ok) return sample;
  const candidate: Record<string, unknown> = {};
  if (form.name.trim() !== original.name) candidate.name = form.name;
  if (form.subjectTpl.trim() !== original.subjectTpl) candidate.subjectTpl = form.subjectTpl;
  if (form.bodyHtmlTpl !== original.bodyHtmlTpl) candidate.bodyHtmlTpl = form.bodyHtmlTpl;
  const text = form.bodyTextTpl.trim() ? form.bodyTextTpl : null;
  if (text !== original.bodyTextTpl) candidate.bodyTextTpl = text;
  if (JSON.stringify(sample.data) !== JSON.stringify(original.sampleVariables ?? {})) {
    candidate.sampleVariables = sample.data;
  }
  if (form.isActive !== original.isActive) candidate.isActive = form.isActive;
  if (Object.keys(candidate).length === 0) return { ok: true, data: null };
  const parsed = updateMailTemplateSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}
