const SECRET_KEY = /pass(word)?|secret|token/i;
const MAX_STRING = 200;
const MAX_DEPTH = 4;

/**
 * Copy of a request body that is safe to store in the audit log: secrets become "***",
 * long strings (template bodies, SQL) are truncated.
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactForAudit(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [
      key,
      SECRET_KEY.test(key) ? '***' : redactForAudit(v, depth + 1),
    ]),
  );
}
