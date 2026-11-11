import type {
  ContactDto,
  ContactSource,
  CreateContactInput,
  Paginated,
  UpdateContactInput,
} from '@erp-mail/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['contacts'] as const;

export interface ContactFilters {
  connectionId: string;
  source: ContactSource | '';
  q: string;
  page: number;
}

export function useContacts(filters: ContactFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: '25' });
  if (filters.connectionId) params.set('connectionId', filters.connectionId);
  if (filters.source) params.set('source', filters.source);
  if (filters.q) params.set('q', filters.q);
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => api.request<Paginated<ContactDto>>(`/contacts?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: [...KEY, 'one', id],
    queryFn: () => api.request<ContactDto>(`/contacts/${id}`),
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      api.request<ContactDto>('/contacts', { method: 'POST', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      api.request<ContactDto>(`/contacts/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.request<void>(`/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
