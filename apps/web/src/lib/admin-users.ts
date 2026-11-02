import type { AdminUserDto, CreateAdminUserInput, UpdateAdminUserInput } from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['admin-users'] as const;

export function useAdminUsers() {
  return useQuery({ queryKey: KEY, queryFn: () => api.request<AdminUserDto[]>('/admin-users') });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminUserInput) =>
      api.request<AdminUserDto>('/admin-users', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAdminUserInput & { id: string }) =>
      api.request<AdminUserDto>(`/admin-users/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResetAdminPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.request<void>(`/admin-users/${id}/reset-password`, {
        method: 'POST',
        json: { password },
      }),
  });
}
