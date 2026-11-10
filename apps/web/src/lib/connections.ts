import type {
  CreateErpConnectionInput,
  ErpConnectionDto,
  TestConnectionResult,
  TestErpConnectionDraftInput,
  UpdateErpConnectionInput,
} from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['connections'] as const;

export function useConnections() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.request<ErpConnectionDto[]>('/connections'),
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateErpConnectionInput) =>
      api.request<ErpConnectionDto>('/connections', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateErpConnectionInput }) =>
      api.request<ErpConnectionDto>(`/connections/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request<TestConnectionResult>(`/connections/${id}/test`, { method: 'POST' }),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Tests unsaved dialog settings; nothing is stored, so no cache invalidation. */
export function useTestConnectionDraft() {
  return useMutation({
    mutationFn: (input: TestErpConnectionDraftInput) =>
      api.request<TestConnectionResult>('/connections/test', { method: 'POST', json: input }),
  });
}
