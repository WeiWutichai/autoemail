import type { CreateSuppressionInput, SuppressedEmailDto } from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['suppressions'] as const;

/**
 * The entry that stops `email` receiving mail from `connectionId`: one for that database
 * first, else one for every database. A null connection only matches every-database entries.
 */
export function findSuppression(
  list: SuppressedEmailDto[] | undefined,
  email: string,
  connectionId: string | null,
): SuppressedEmailDto | undefined {
  const matches = (list ?? []).filter((s) => s.email === email.toLowerCase());
  return (
    (connectionId ? matches.find((s) => s.connectionId === connectionId) : undefined) ??
    matches.find((s) => s.connectionId === null)
  );
}

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
