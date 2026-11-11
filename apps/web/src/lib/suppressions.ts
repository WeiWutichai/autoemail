import type { CreateSuppressionInput, SuppressedEmailDto } from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['suppressions'] as const;

export function useSuppressions() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.request<SuppressedEmailDto[]>('/suppressions'),
  });
}

export function useCreateSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSuppressionInput) =>
      api.request<SuppressedEmailDto>('/suppressions', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/suppressions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
