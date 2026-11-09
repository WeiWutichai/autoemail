import type {
  CreateMailTemplateInput,
  MailTemplateDto,
  MailTemplateVersionDto,
  RenderedMail,
  RenderTemplateInput,
  TestSendInput,
  TestSendResult,
  UpdateMailTemplateInput,
} from '@erp-mail/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['templates'] as const;

export function useTemplates() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.request<MailTemplateDto[]>('/templates'),
  });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: () => api.request<MailTemplateDto>(`/templates/${id}`),
    enabled: id !== null,
  });
}

export function useTemplateVersions(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id, 'versions'],
    queryFn: () => api.request<MailTemplateVersionDto[]>(`/templates/${id}/versions`),
    enabled: id !== null,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMailTemplateInput) =>
      api.request<MailTemplateDto>('/templates', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMailTemplateInput }) =>
      api.request<MailTemplateDto>(`/templates/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Live preview; `input` null disables the query (e.g. invalid sample JSON). */
export function useTemplatePreview(input: RenderTemplateInput | null) {
  return useQuery({
    queryKey: [...KEY, 'preview', input],
    queryFn: () => api.request<RenderedMail>('/templates/preview', { method: 'POST', json: input }),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useTestSend() {
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TestSendInput }) =>
      api.request<TestSendResult>(`/templates/${id}/test-send`, { method: 'POST', json: input }),
  });
}
