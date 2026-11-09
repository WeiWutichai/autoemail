import {
  createSyncConfigSchema,
  updateSyncConfigSchema,
  type ColumnMapping,
  type CreateSyncConfigInput,
  type SyncConfigDto,
  type SyncKind,
  type UpdateSyncConfigInput,
} from '@erp-mail/shared';

export const SYNC_KIND_LABELS: Record<SyncKind, string> = {
  CONTACTS: 'รายชื่อ (contacts)',
  OUTBOX: 'เมลที่ต้องส่ง (outbox)',
};

export interface SyncForm {
  connectionId: string;
  name: string;
  kind: SyncKind;
  querySql: string;
  /** One `target=source` per line or comma. */
  mapping: string;
  /** Minutes, as typed. */
  intervalMin: string;
  isActive: boolean;
  /** OUTBOX: '' = none. */
  templateId: string;
  /** OUTBOX: '' = default SMTP. */
  smtpConfigId: string;
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function emptySyncForm(connectionId = '', kind: SyncKind = 'CONTACTS'): SyncForm {
  return {
    connectionId,
    name: '',
    kind,
    querySql: '',
    mapping: '',
    intervalMin: '5',
    isActive: true,
    templateId: '',
    smtpConfigId: '',
  };
}

export function formatMapping(mapping: ColumnMapping | null): string {
  return mapping
    ? Object.entries(mapping)
        .map(([target, source]) => `${target}=${source}`)
        .join('\n')
    : '';
}

export function formFromSyncConfig(config: SyncConfigDto): SyncForm {
  return {
    connectionId: config.connectionId,
    name: config.name,
    kind: config.kind,
    querySql: config.querySql,
    mapping: formatMapping(config.columnMapping),
    intervalMin: String(Math.round(config.pollIntervalSec / 60)),
    isActive: config.isActive,
    templateId: config.templateId ?? '',
    smtpConfigId: config.smtpConfigId ?? '',
  };
}

/** Parses `email=Z_Email, name = DeptName` into `{ email: 'Z_Email', name: 'DeptName' }`. */
export function parseMapping(text: string): FormResult<ColumnMapping | null> {
  const entries = text
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length === 0) return { ok: true, data: null };
  const mapping: ColumnMapping = {};
  for (const entry of entries) {
    const [target, source, ...rest] = entry.split('=').map((s) => s.trim());
    if (!target || !source || rest.length > 0) {
      return {
        ok: false,
        error: `รูปแบบ mapping ไม่ถูกต้อง: "${entry}" (ใช้ ชื่อปลายทาง=ชื่อคอลัมน์)`,
      };
    }
    mapping[target.toLowerCase()] = source;
  }
  return { ok: true, data: mapping };
}

function intervalSec(text: string): number {
  return Math.round(Number(text) * 60);
}

const FIELD_ERRORS: Record<string, string> = {
  connectionId: 'กรุณาเลือก connection',
  name: 'กรุณากรอกชื่อ',
  querySql: 'กรุณากรอก SQL query',
  pollIntervalSec: 'รอบเวลาต้องอยู่ระหว่าง 1 นาที ถึง 1 วัน (1440 นาที)',
  columnMapping: 'ชื่อคอลัมน์ใน mapping ใช้ได้เฉพาะ A-Z, 0-9 และ _',
  templateId: 'กรุณาเลือก template',
};

function firstError(issues: { path: (string | number)[] }[]): string {
  const field = String(issues[0]?.path[0] ?? '');
  return FIELD_ERRORS[field] ?? 'ข้อมูลไม่ถูกต้อง';
}

export function toCreateSyncInput(form: SyncForm): FormResult<CreateSyncConfigInput> {
  const mapping = parseMapping(form.mapping);
  if (!mapping.ok) return mapping;
  const parsed = createSyncConfigSchema.safeParse({
    connectionId: form.connectionId,
    name: form.name,
    kind: form.kind,
    querySql: form.querySql,
    columnMapping: mapping.data,
    pollIntervalSec: intervalSec(form.intervalMin),
    isActive: form.isActive,
    templateId: form.kind === 'OUTBOX' ? form.templateId || null : null,
    smtpConfigId: form.kind === 'OUTBOX' ? form.smtpConfigId || null : null,
  });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}

/** Only changed fields; `data: null` when nothing changed. */
export function toUpdateSyncInput(
  form: SyncForm,
  original: SyncConfigDto,
): FormResult<UpdateSyncConfigInput | null> {
  const mapping = parseMapping(form.mapping);
  if (!mapping.ok) return mapping;
  const candidate: Record<string, unknown> = {};
  if (form.name.trim() !== original.name) candidate.name = form.name;
  if (form.querySql.trim() !== original.querySql) candidate.querySql = form.querySql;
  if (JSON.stringify(mapping.data) !== JSON.stringify(original.columnMapping)) {
    candidate.columnMapping = mapping.data;
  }
  const sec = intervalSec(form.intervalMin);
  if (sec !== original.pollIntervalSec) candidate.pollIntervalSec = sec;
  if (form.isActive !== original.isActive) candidate.isActive = form.isActive;
  if (original.kind === 'OUTBOX') {
    if (!form.templateId) return { ok: false, error: FIELD_ERRORS.templateId };
    if (form.templateId !== original.templateId) candidate.templateId = form.templateId;
    if ((form.smtpConfigId || null) !== original.smtpConfigId) {
      candidate.smtpConfigId = form.smtpConfigId || null;
    }
  }
  if (Object.keys(candidate).length === 0) return { ok: true, data: null };

  const parsed = updateSyncConfigSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}

/** docs/erp-queries/pr-po-pending-approval.sql (SQL Server) — PR / PO waiting for approval. */
export const PR_PO_QUERY = `SELECT
    d.doc_type + ':' + d.order_no + ':' + LOWER(LTRIM(RTRIM(m.Email))) AS erp_ref_id,
    LTRIM(RTRIM(m.Email)) AS to_email,
    d.doc_type, d.status, d.order_no, d.doc_date, d.supplier_code, d.supplier_name,
    d.dept_code, d.department, d.approved, d.approved_by,
    m.Approved AS mail_approved
FROM (
    SELECT 'PR' AS doc_type,
        CASE
            WHEN ISNULL(S.IsClosed, 0) = 1 THEN N'ยกเลิกเอกสาร'
            WHEN ISNULL(S.IsComplete, 0) = 1 THEN N'ปิดงาน'
            WHEN ISNULL(S.IsApproved, 0) = 1 THEN N'อนุมัติเอกสาร'
            WHEN ISNULL(S.IsCheck, 0) = 1 THEN N'ตรวจสอบเอกสาร'
            ELSE N'รอการอนุมัติ'
        END AS status,
        S.PRNo AS order_no,
        CONVERT(DATE, S.PRDate) AS doc_date,
        '' AS supplier_code,
        '' AS supplier_name,
        ISNULL(S.DeptCode, ' ') AS dept_code,
        ISNULL(S.Department, ' ') AS department,
        ISNULL(S.IsApproved, 0) AS approved,
        ISNULL(S.IsApprovedBy, ' ') AS approved_by
    FROM PurchaseRequisitionHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0 AND S.IsComplete <> 1 AND S.IsClosed <> 1

    UNION ALL

    SELECT 'PO' AS doc_type,
        CASE
            WHEN ISNULL(S.IsClosed, 0) = 1 THEN N'ยกเลิกเอกสาร'
            WHEN ISNULL(S.IsComplete, 0) = 1 THEN N'ปิดงาน'
            WHEN ISNULL(S.IsApproved, 0) = 1 THEN N'อนุมัติเอกสาร'
            WHEN ISNULL(S.IsCheck, 0) = 1 THEN N'ตรวจสอบเอกสาร'
            ELSE N'รอการอนุมัติ'
        END AS status,
        S.PONumber AS order_no,
        CONVERT(DATE, S.PODate) AS doc_date,
        S.SupplierCode AS supplier_code,
        S.SupplierName AS supplier_name,
        ISNULL(S.DeptCode, ' ') AS dept_code,
        ISNULL(S.Department, ' ') AS department,
        ISNULL(S.IsApproved, 0) AS approved,
        ISNULL(S.Appr_By, ' ') AS approved_by
    FROM PurchaseOrderHdr S WITH (NOLOCK)
    WHERE S.IsApproved = 0 AND S.IsComplete <> 1 AND S.IsClosed <> 1
) d
INNER JOIN Z_MaIL m WITH (NOLOCK) ON m.DeptCode = d.dept_code
WHERE d.dept_code <> ' '
  AND LTRIM(RTRIM(ISNULL(m.Email, ''))) <> ''`;
