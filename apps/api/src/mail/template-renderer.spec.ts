import {
  formatDate,
  formatNumber,
  htmlToText,
  TemplateRenderer,
  TemplateSyntaxError,
} from './template-renderer';

describe('TemplateRenderer', () => {
  const renderer = new TemplateRenderer();

  it('escapes HTML in the body but not in the subject / text', () => {
    const out = renderer.render(
      {
        subjectTpl: 'PR {{order_no}}\nfrom {{supplier_name}}',
        bodyHtmlTpl: '<p>{{supplier_name}}</p>',
        bodyTextTpl: 'Supplier: {{supplier_name}}',
      },
      { order_no: 'PR-001', supplier_name: 'A & B <Co>' },
    );
    expect(out).toEqual({
      subject: 'PR PR-001 from A & B <Co>',
      html: '<p>A &amp; B &lt;Co&gt;</p>',
      text: 'Supplier: A & B <Co>',
    });
  });

  it('derives the text part from HTML and renders missing variables as empty', () => {
    const out = renderer.render(
      {
        subjectTpl: 'x',
        bodyHtmlTpl: '<p>Hello {{name}}</p><p>Line&nbsp;2<br>3</p>',
        bodyTextTpl: null,
      },
      {},
    );
    expect(out.text).toBe('Hello\nLine 2\n3');
  });

  it('provides formatting helpers', () => {
    const out = renderer.render(
      {
        subjectTpl:
          '{{formatDate d}} {{formatDate d "iso"}} {{formatNumber n}} {{formatNumber n 0}} {{default x "-"}}',
        bodyHtmlTpl: '{{formatDateTime d "short" "Asia/Bangkok"}}',
        bodyTextTpl: null,
      },
      { d: '2026-11-09T17:30:00.000Z', n: '1234.5' },
    );
    expect(out.subject).toBe('09/11/2569 2026-11-09 1,234.50 1,235 -');
    expect(out.html).toContain('10/11/2569');
  });

  it('reports the field with a syntax error', () => {
    expect(() =>
      renderer.validate({ subjectTpl: 'ok', bodyHtmlTpl: '{{#if x}}', bodyTextTpl: null }),
    ).toThrow(TemplateSyntaxError);
    try {
      renderer.validate({ subjectTpl: '{{', bodyHtmlTpl: 'x', bodyTextTpl: null });
    } catch (err) {
      expect((err as TemplateSyntaxError).field).toBe('subjectTpl');
    }
  });
});

describe('format helpers', () => {
  it('passes through values that are not dates / numbers', () => {
    expect(formatDate('not a date')).toBe('not a date');
    expect(formatDate(null)).toBe('');
    expect(formatNumber('abc')).toBe('abc');
    expect(formatNumber(null)).toBe('');
  });

  it('strips scripts and decodes entities in htmlToText', () => {
    expect(htmlToText('<style>p{}</style><b>A&amp;B</b> &lt;x&gt;')).toBe('A&B <x>');
  });
});
