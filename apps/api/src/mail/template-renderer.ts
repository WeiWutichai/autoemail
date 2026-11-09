import { Injectable } from '@nestjs/common';
import type { RenderedMail, TemplateVariables } from '@erp-mail/shared';
import Handlebars from 'handlebars';

export interface TemplateSource {
  subjectTpl: string;
  bodyHtmlTpl: string;
  bodyTextTpl: string | null;
}

type HelperOptions = Handlebars.HelperOptions;

/** Drops the trailing Handlebars options argument from helper args. */
function helperArgs(args: unknown[]): unknown[] {
  return args.slice(0, -1);
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * ERP datetimes have no zone and arrive as UTC wall-clock values, so they are formatted in UTC
 * unless a zone is passed explicitly: {{formatDate doc_date "long" "Asia/Bangkok"}}.
 */
const DATE_STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
};

export function formatDate(value: unknown, style = 'short', timeZone = 'UTC', withTime = false) {
  const date = toDate(value);
  if (!date) return value === null || value === undefined ? '' : String(value);
  if (style === 'iso')
    return date
      .toISOString()
      .slice(0, withTime ? 16 : 10)
      .replace('T', ' ');
  return new Intl.DateTimeFormat('th-TH', {
    ...(DATE_STYLES[style] ?? DATE_STYLES.short),
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone,
  }).format(date);
}

export function formatNumber(value: unknown, decimals = 2): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    return value === null || value === undefined ? '' : String(value);
  }
  return n.toLocaleString('th-TH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Very small HTML → text fallback for the plain-text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class TemplateSyntaxError extends Error {
  constructor(
    readonly field: keyof TemplateSource,
    message: string,
  ) {
    super(message);
    this.name = 'TemplateSyntaxError';
  }
}

/** Handlebars rendering shared by preview, test send and the outbox sync. */
@Injectable()
export class TemplateRenderer {
  private readonly hbs = Handlebars.create();

  constructor() {
    this.hbs.registerHelper('formatDate', (value: unknown, ...rest: unknown[]) => {
      const [style, tz] = helperArgs(rest);
      return formatDate(
        value,
        typeof style === 'string' ? style : 'short',
        typeof tz === 'string' ? tz : 'UTC',
      );
    });
    this.hbs.registerHelper('formatDateTime', (value: unknown, ...rest: unknown[]) => {
      const [style, tz] = helperArgs(rest);
      return formatDate(
        value,
        typeof style === 'string' ? style : 'short',
        typeof tz === 'string' ? tz : 'UTC',
        true,
      );
    });
    this.hbs.registerHelper('formatNumber', (value: unknown, ...rest: unknown[]) => {
      const [decimals] = helperArgs(rest);
      return formatNumber(value, typeof decimals === 'number' ? decimals : 2);
    });
    this.hbs.registerHelper('default', (value: unknown, fallback: unknown, _o: HelperOptions) =>
      value === null || value === undefined || value === '' ? fallback : value,
    );
  }

  /** Throws {@link TemplateSyntaxError} naming the first field that does not compile. */
  validate(source: TemplateSource): void {
    for (const field of ['subjectTpl', 'bodyHtmlTpl', 'bodyTextTpl'] as const) {
      const tpl = source[field];
      if (!tpl) continue;
      try {
        this.hbs.precompile(tpl);
      } catch (err) {
        throw new TemplateSyntaxError(field, (err as Error).message.split('\n')[0]);
      }
    }
  }

  render(source: TemplateSource, variables: TemplateVariables): RenderedMail {
    this.validate(source);
    const subject = this.compile(source.subjectTpl, true)(variables).replace(/\s+/g, ' ').trim();
    const html = this.compile(source.bodyHtmlTpl, false)(variables);
    const text = source.bodyTextTpl
      ? this.compile(source.bodyTextTpl, true)(variables)
      : htmlToText(html);
    return { subject, html, text };
  }

  private compile(tpl: string, noEscape: boolean): Handlebars.TemplateDelegate {
    return this.hbs.compile(tpl, { noEscape, strict: false });
  }
}
