import type {
  CreateErpConnectionInput,
  ErpConnectionDto,
  TestConnectionResult,
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
