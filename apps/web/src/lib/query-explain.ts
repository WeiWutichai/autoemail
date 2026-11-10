/**
 * Best-effort, read-only summary of an admin's ERP SELECT for the Sync dialog:
 * which tables it reads, the WHERE / JOIN conditions in plain Thai, and common pitfalls.
 * It only inspects the text; the authoritative check is still "ตรวจ query" against the ERP.
 */

export interface ExplainedCondition {
  /** The condition as written (whitespace collapsed). */
  sql: string;
  /** Thai meaning when the pattern is recognised. */
  meaning: string | null;
  /** Pitfall worth flagging, e.g. NULL rows silently dropped. */
  warning: string | null;
}

export interface ExplainedSource {
  table: string;
  label: string | null;
  conditions: ExplainedCondition[];
}

export interface ExplainedJoin {
  kind: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  label: string | null;
  on: ExplainedCondition[];
}

export interface QueryExplanation {
  sources: ExplainedSource[];
  joins: ExplainedJoin[];
  /** Output aliases found in the outermost SELECT list (lower-cased). */
  outputs: string[];
}

/** Known ERP tables (lower-cased name → Thai label). */
const TABLE_LABELS: Record<string, string> = {
  purchaserequisitionhdr: 'ใบขอซื้อ (PR)',
  purchaseorderhdr: 'ใบสั่งซื้อ (PO)',
  salesorderhdr: 'ใบสั่งขาย (SO)',
  z_mail: 'อีเมลของแต่ละแผนก',
};

/** Yes/no flag columns: [meaning when 1, meaning when 0]. */
const FLAG_LABELS: Record<string, [string, string]> = {
  isapproved: ['อนุมัติแล้ว', 'ยังไม่อนุมัติ'],
  iscomplete: ['ปิดงานแล้ว', 'ยังไม่ปิดงาน'],
  isclosed: ['ยกเลิกแล้ว', 'ยังไม่ยกเลิก'],
  ischeck: ['ตรวจสอบแล้ว', 'ยังไม่ตรวจสอบ'],
  approved: ['อนุมัติแล้ว', 'ยังไม่อนุมัติ'],
};

const OPERATOR_LABELS: Record<string, string> = {
  '=': 'เท่ากับ',
  '<>': 'ไม่เท่ากับ',
  '!=': 'ไม่เท่ากับ',
  '>': 'มากกว่า',
  '>=': 'ตั้งแต่',
  '<': 'น้อยกว่า',
  '<=': 'ไม่เกิน',
};

const DATE_UNITS: Record<string, string> = {
  day: 'วัน',
  dd: 'วัน',
  d: 'วัน',
  month: 'เดือน',
  mm: 'เดือน',
  m: 'เดือน',
  year: 'ปี',
  yy: 'ปี',
  yyyy: 'ปี',
  week: 'สัปดาห์',
  wk: 'สัปดาห์',
  hour: 'ชั่วโมง',
  hh: 'ชั่วโมง',
};

/** Replaces comments and string-literal contents with filler of equal length so indexes still line up. */
function mask(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      const stop = Math.min(j + 1, sql.length);
      out += `'${'x'.repeat(Math.max(stop - i - 2, 0))}${stop - i >= 2 ? "'" : ''}`;
      i = stop;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

function depths(masked: string): number[] {
  const result: number[] = [];
  let depth = 0;
  for (const ch of masked) {
    if (ch === '(') {
      result.push(depth);
      depth += 1;
    } else if (ch === ')') {
      depth = Math.max(depth - 1, 0);
      result.push(depth);
    } else {
      result.push(depth);
    }
  }
  return result;
}

interface Keyword {
  word: string;
  index: number;
  end: number;
  depth: number;
}

const KEYWORD_RE =
  /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|UNION(?:\s+ALL)?|INNER\s+JOIN|LEFT\s+(?:OUTER\s+)?JOIN|RIGHT\s+(?:OUTER\s+)?JOIN|FULL\s+(?:OUTER\s+)?JOIN|CROSS\s+JOIN|JOIN|ON)\b/gi;

function keywords(masked: string, depth: number[]): Keyword[] {
  return Array.from(masked.matchAll(KEYWORD_RE)).map((m) => ({
    word: m[1].toUpperCase().replace(/\s+/g, ' '),
    index: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    depth: depth[m.index ?? 0] ?? 0,
  }));
}

/** End of a clause that starts at `start` (exclusive): next stop keyword at the same depth or a closing paren. */
function clauseEnd(
  masked: string,
  depth: number[],
  kws: Keyword[],
  start: number,
  d: number,
  stops: RegExp,
): number {
  let close = masked.length;
  for (let i = start; i < masked.length; i += 1) {
    if (masked[i] === ')' && depth[i] < d) {
      close = i;
      break;
    }
  }
  const next = kws.find(
    (k) => k.index >= start && k.index < close && k.depth === d && stops.test(k.word),
  );
  return next ? next.index : close;
}

/** Splits on top-level AND, keeping `BETWEEN x AND y` together; any top-level OR keeps the clause whole. */
function splitAnd(sql: string, masked: string): string[] {
  const depth = depths(masked);
  const base = depth[0] ?? 0;
  const parts: string[] = [];
  let from = 0;
  let pendingBetween = false;
  for (const m of Array.from(masked.matchAll(/\b(AND|OR|BETWEEN)\b/gi))) {
    const at = m.index ?? 0;
    if (depth[at] !== base) continue;
    const word = m[1].toUpperCase();
    if (word === 'OR') return [sql];
    if (word === 'BETWEEN') {
      pendingBetween = true;
      continue;
    }
    if (pendingBetween) {
      pendingBetween = false;
      continue;
    }
    parts.push(sql.slice(from, at));
    from = at + m[0].length;
  }
  parts.push(sql.slice(from));
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const stripAlias = (column: string) => column.replace(/^\[?\w+\]?\./, '').replace(/[[\]]/g, '');

function describeValue(raw: string): string {
  const v = raw.trim();
  if (/^N?'\s*'$/.test(v)) return 'ค่าว่าง';
  return v.replace(/^N'/, "'");
}

/** Recognises common condition shapes; anything else keeps `meaning: null`. */
export function explainCondition(sql: string): ExplainedCondition {
  const text = sql.replace(/\s+/g, ' ').trim();
  const result: ExplainedCondition = { sql: text, meaning: null, warning: null };

  // ISNULL(col, x) <op> v  — NULL handled explicitly.
  const wrapped = /^ISNULL\(\s*([\w.[\]]+)\s*,\s*([^)]*)\)\s*(=|<>|!=)\s*(.+)$/i.exec(text);
  // col <op> v
  const plain = /^([\w.[\]]+)\s*(=|<>|!=|>=|<=|>|<)\s*(.+)$/i.exec(text);

  const flagMeaning = (column: string, op: string, value: string): string | null => {
    const flag = FLAG_LABELS[stripAlias(column).toLowerCase()];
    if (!flag || !/^[01]$/.test(value.trim())) return null;
    const isOne = value.trim() === '1';
    const positive = op === '=' ? isOne : !isOne;
    return positive ? flag[0] : flag[1];
  };

  if (wrapped) {
    const [, column, , op, value] = wrapped;
    result.meaning =
      flagMeaning(column, op, value) ??
      `${stripAlias(column)} ${OPERATOR_LABELS[op]} ${describeValue(value)}`;
    return result;
  }

  const recent =
    /^([\w.[\]]+)\s*>=?\s*DATEADD\(\s*(\w+)\s*,\s*-\s*(\d+)\s*,\s*(?:GETDATE|SYSDATETIME|CURRENT_TIMESTAMP)\(?\)?\s*\)$/i.exec(
      text,
    );
  if (recent) {
    const unit = DATE_UNITS[recent[2].toLowerCase()] ?? recent[2];
    result.meaning = `${stripAlias(recent[1])} ภายใน ${recent[3]} ${unit}ล่าสุด`;
    return result;
  }

  const notBlank =
    /^(?:LTRIM\(\s*RTRIM\(\s*)?(?:ISNULL\(\s*)?([\w.[\]]+)(?:\s*,\s*N?'[^']*'\s*\))?(?:\s*\)\s*\))?\s*(<>|!=)\s*N?'\s*'$/i.exec(
      text,
    );
  if (notBlank) {
    result.meaning = `${stripAlias(notBlank[1])} ต้องไม่ว่าง`;
    return result;
  }

  if (plain) {
    const [, column, op, value] = plain;
    if (/^[\w.[\]]+$/.test(value.trim()) && !/^\d+$/.test(value.trim()) && op === '=') {
      result.meaning = `จับคู่ ${stripAlias(column)} กับ ${stripAlias(value)}`;
      return result;
    }
    result.meaning =
      flagMeaning(column, op, value) ??
      `${stripAlias(column)} ${OPERATOR_LABELS[op] ?? op} ${describeValue(value)}`;
    if (op === '<>' || op === '!=') {
      result.warning = `แถวที่ ${stripAlias(column)} เป็น NULL จะไม่ถูกดึงด้วย — ถ้าต้องการให้นับเป็น 0 ใช้ ISNULL(${column}, 0) ${op} ${value.trim()}`;
    }
    return result;
  }

  const isNull = /^([\w.[\]]+)\s+IS\s+(NOT\s+)?NULL$/i.exec(text);
  if (isNull) {
    result.meaning = `${stripAlias(isNull[1])} ${isNull[2] ? 'มีค่า' : 'ไม่มีค่า (NULL)'}`;
  }
  return result;
}

function tableAfter(sql: string, masked: string, from: number): string | null {
  const m = /^\s*([#\w.[\]]+)/.exec(masked.slice(from));
  if (!m) return null;
  const start = from + (m.index ?? 0) + m[0].length - m[1].length;
  return sql.slice(start, start + m[1].length).replace(/[[\]]/g, '');
}

const labelFor = (table: string) =>
  TABLE_LABELS[table.split('.').pop()?.toLowerCase() ?? ''] ?? null;

const JOIN_KIND: Record<string, ExplainedJoin['kind']> = {
  'INNER JOIN': 'INNER',
  JOIN: 'INNER',
  'LEFT JOIN': 'LEFT',
  'LEFT OUTER JOIN': 'LEFT',
  'RIGHT JOIN': 'RIGHT',
  'RIGHT OUTER JOIN': 'RIGHT',
  'FULL JOIN': 'FULL',
  'FULL OUTER JOIN': 'FULL',
};

function outerOutputs(sql: string, masked: string, kws: Keyword[]): string[] {
  const select = kws.find((k) => k.word === 'SELECT' && k.depth === 0);
  const from = kws.find((k) => k.word === 'FROM' && k.depth === 0);
  if (!select) return [];
  const list = masked.slice(select.end, from ? from.index : masked.length);
  const aliases = Array.from(list.matchAll(/\bAS\s+\[?(\w+)\]?/gi)).map((m) => m[1].toLowerCase());
  // Bare `d.col` items also surface under their column name.
  const depth = depths(list);
  let start = 0;
  const items: string[] = [];
  for (let i = 0; i <= list.length; i += 1) {
    if (i === list.length || (list[i] === ',' && depth[i] === 0)) {
      items.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  const bare = items
    .filter((item) => /^[\w.[\]]+$/.test(item))
    .map((item) => stripAlias(item).toLowerCase());
  return Array.from(new Set(aliases.concat(bare)));
}

export function explainQuery(sql: string): QueryExplanation {
  const masked = mask(sql);
  const depth = depths(masked);
  const kws = keywords(masked, depth);
  const sources: ExplainedSource[] = [];
  const joins: ExplainedJoin[] = [];

  for (const kw of kws) {
    if (kw.word === 'FROM') {
      const table = tableAfter(sql, masked, kw.end);
      if (!table || masked.slice(kw.end).trimStart().startsWith('(')) continue;
      // The WHERE of this SELECT: next WHERE at the same depth before the next FROM/UNION/close.
      const scopeEnd = clauseEnd(
        masked,
        depth,
        kws,
        kw.end,
        kw.depth,
        /^(FROM|UNION|UNION ALL|SELECT)$/,
      );
      const where = kws.find(
        (k) => k.word === 'WHERE' && k.depth === kw.depth && k.index > kw.end && k.index < scopeEnd,
      );
      sources.push({
        table,
        label: labelFor(table),
        conditions: where ? conditionsOf(sql, masked, depth, kws, where) : [],
      });
    } else if (JOIN_KIND[kw.word]) {
      const table = tableAfter(sql, masked, kw.end);
      if (!table) continue;
      const on = kws.find((k) => k.word === 'ON' && k.depth === kw.depth && k.index > kw.end);
      joins.push({
        kind: JOIN_KIND[kw.word],
        table,
        label: labelFor(table),
        on: on ? conditionsOf(sql, masked, depth, kws, on) : [],
      });
    }
  }

  // WHERE on a derived table (FROM ( ... ) d) applies to the combined rows.
  const outerFrom = kws.find((k) => k.word === 'FROM' && k.depth === 0);
  if (outerFrom && masked.slice(outerFrom.end).trimStart().startsWith('(')) {
    const where = kws.find((k) => k.word === 'WHERE' && k.depth === 0);
    if (where) {
      sources.push({
        table: 'ผลรวมของทุกตาราง',
        label: null,
        conditions: conditionsOf(sql, masked, depth, kws, where),
      });
    }
  }

  return { sources, joins, outputs: outerOutputs(sql, masked, kws) };
}

function conditionsOf(
  sql: string,
  masked: string,
  depth: number[],
  kws: Keyword[],
  kw: Keyword,
): ExplainedCondition[] {
  const stops =
    kw.word === 'ON'
      ? /^(WHERE|GROUP BY|ORDER BY|HAVING|UNION|UNION ALL|ON|JOIN|INNER JOIN|LEFT JOIN|LEFT OUTER JOIN|RIGHT JOIN|RIGHT OUTER JOIN|FULL JOIN|FULL OUTER JOIN|CROSS JOIN)$/
      : /^(GROUP BY|ORDER BY|HAVING|UNION|UNION ALL)$/;
  const end = clauseEnd(masked, depth, kws, kw.end, kw.depth, stops);
  return splitAnd(sql.slice(kw.end, end), masked.slice(kw.end, end)).map(explainCondition);
}
