import {
  createErpConnectionSchema,
  DEFAULT_PORTS,
  updateErpConnectionSchema,
  type CreateErpConnectionInput,
  type DbType,
  type ErpConnectionDto,
  type UpdateErpConnectionInput,
} from '@erp-mail/shared';

/** Form state for the connection dialog (port kept as text while typing). */
export interface ConnectionForm {
  name: string;
  dbType: DbType;
  host: string;
  port: string;
  database: string;
  username: string;
  /** Empty while editing means "keep the stored password". */
  password: string;
  ssl: boolean;
  trustServerCert: boolean;
  isActive: boolean;
}

export const DB_TYPE_LABELS: Record<DbType, string> = {
  MSSQL: 'SQL Server',
  ORACLE: 'Oracle',
  MYSQL: 'MySQL',
  POSTGRES: 'PostgreSQL',
};

export function emptyConnectionForm(dbType: DbType = 'MSSQL'): ConnectionForm {
  return {
    name: '',
    dbType,
    host: '',
    port: String(DEFAULT_PORTS[dbType]),
    database: '',
    username: '',
    password: '',
    ssl: false,
    trustServerCert: false,
    isActive: true,
  };
}

export function formFromConnection(conn: ErpConnectionDto): ConnectionForm {
  return {
    name: conn.name,
    dbType: conn.dbType,
    host: conn.host,
    port: String(conn.port),
    database: conn.database,
    username: conn.username,
    password: '',
    ssl: conn.ssl,
    trustServerCert: conn.trustServerCert,
    isActive: conn.isActive,
  };
}

/** Switching DB type also switches the port when it still holds the previous default. */
export function changeDbType(form: ConnectionForm, dbType: DbType): ConnectionForm {
  const usingDefault = form.port === '' || form.port === String(DEFAULT_PORTS[form.dbType]);
  return { ...form, dbType, port: usingDefault ? String(DEFAULT_PORTS[dbType]) : form.port };
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const INVALID = 'กรุณากรอกชื่อ, Host, Port (1–65535), Database และ Username ให้ครบและถูกต้อง';

function toPort(value: string): number {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
}

export function toCreateInput(form: ConnectionForm): FormResult<CreateErpConnectionInput> {
  const parsed = createErpConnectionSchema.safeParse({
    ...form,
    port: toPort(form.port),
    password: form.password === '' ? undefined : form.password,
  });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: INVALID };
}

/** Sends only the fields that changed; `null` data means nothing to save. */
export function toUpdateInput(
  form: ConnectionForm,
  original: ErpConnectionDto,
): FormResult<UpdateErpConnectionInput | null> {
  const full = createErpConnectionSchema.safeParse({
    ...form,
    port: toPort(form.port),
    password: form.password === '' ? undefined : form.password,
  });
  if (!full.success) return { ok: false, error: INVALID };

  const next = full.data;
  const changes: Record<string, unknown> = {};
  const keys = [
    'name',
    'dbType',
    'host',
    'port',
    'database',
    'username',
    'ssl',
    'trustServerCert',
    'isActive',
  ] as const;
  for (const key of keys) {
    if (next[key] !== original[key]) changes[key] = next[key];
  }
  if (next.password !== undefined) changes.password = next.password;

  if (Object.keys(changes).length === 0) return { ok: true, data: null };
  const parsed = updateErpConnectionSchema.safeParse(changes);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: INVALID };
}
