import type {
  CreateSmtpConfigInput,
  SmtpConfigDto,
  TestSmtpInput,
  TestSmtpResult,
  UpdateSmtpConfigInput,
} from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['smtp-configs'] as const;

export function useSmtpConfigs() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.request<SmtpConfigDto[]>('/smtp-configs'),
  });
}

export function useCreateSmtpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSmtpConfigInput) =>
      api.request<SmtpConfigDto>('/smtp-configs', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSmtpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSmtpConfigInput }) =>
      api.request<SmtpConfigDto>(`/smtp-configs/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSmtpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/smtp-configs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TestSmtpInput }) =>
      api.request<TestSmtpResult>(`/smtp-configs/${id}/test`, { method: 'POST', json: input }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
