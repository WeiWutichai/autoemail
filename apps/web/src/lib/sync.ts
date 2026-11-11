import type {
  CollectContactsResult,
  CreateSyncConfigInput,
  QueryPreviewInput,
  QueryPreviewResult,
  SyncConfigDto,
  SyncRunResponse,
  UpdateSyncConfigInput,
} from '@erp-mail/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['sync-configs'] as const;

export function useSyncConfigs() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.request<SyncConfigDto[]>('/sync-configs'),
  });
}

export function useCreateSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSyncConfigInput) =>
      api.request<SyncConfigDto>('/sync-configs', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSyncConfigInput }) =>
      api.request<SyncConfigDto>(`/sync-configs/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/sync-configs/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function usePreviewQuery() {
  return useMutation({
    mutationFn: (input: QueryPreviewInput) =>
      api.request<QueryPreviewResult>('/sync-configs/preview', { method: 'POST', json: input }),
  });
}

export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request<SyncRunResponse>(`/sync-configs/${id}/run`, { method: 'POST' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

/** Stores an outbox sync's recipients as contacts; nothing is sent. */
export function useCollectContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.request<CollectContactsResult>(`/sync-configs/${id}/collect-contacts`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
