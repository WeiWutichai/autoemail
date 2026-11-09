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
  if (Object.keys(candidate).length === 0) return { ok: true, data: null };

  const parsed = updateSyncConfigSchema.safeParse(candidate);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: firstError(parsed.error.issues) };
}
