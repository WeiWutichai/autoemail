import type { MailTemplateDto } from '@erp-mail/shared';
import {
  emptyTemplateForm,
  formFromTemplate,
  parseSample,
  toCreateTemplateInput,
  toUpdateTemplateInput,
} from './template-form';

const template: MailTemplateDto = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'pr_pending',
  name: 'PR',
  subjectTpl: 'PR {{order_no}}',
  bodyHtmlTpl: '<p>x</p>',
  bodyTextTpl: null,
  sampleVariables: { order_no: 'PR-1' },
  isActive: true,
  version: 2,
  createdAt: '',
  updatedAt: '',
};

describe('template form', () => {
  it('parses sample JSON objects only', () => {
    expect(parseSample('{"a":1}')).toEqual({ ok: true, data: { a: 1 } });
    expect(parseSample('')).toEqual({ ok: true, data: {} });
    expect(parseSample('[1]').ok).toBe(false);
    expect(parseSample('{').ok).toBe(false);
  });

  it('creates from the PR/PO starter', () => {
    const res = toCreateTemplateInput({ ...emptyTemplateForm(), code: 'pr_pending', name: 'PR' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.bodyTextTpl).toBeNull();
      expect(res.data.sampleVariables).toMatchObject({ doc_type: 'PR' });
    }
    expect(
      toCreateTemplateInput({ ...emptyTemplateForm(), code: 'Bad Code', name: 'x' }),
    ).toMatchObject({
      ok: false,
    });
  });

  it('sends only changed fields', () => {
    const form = formFromTemplate(template);
    expect(toUpdateTemplateInput(form, template)).toEqual({ ok: true, data: null });
    expect(
      toUpdateTemplateInput({ ...form, subjectTpl: 'PO {{order_no}}', sample: '{}' }, template),
    ).toEqual({ ok: true, data: { subjectTpl: 'PO {{order_no}}', sampleVariables: {} } });
  });
});
