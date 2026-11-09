import type { ContactDto, Paginated } from '@erp-mail/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api-client';

export interface ContactFilters {
  connectionId: string;
  q: string;
  page: number;
}

export function useContacts(filters: ContactFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: '25' });
  if (filters.connectionId) params.set('connectionId', filters.connectionId);
  if (filters.q) params.set('q', filters.q);
  return useQuery({
    queryKey: ['contacts', filters],
    queryFn: () => api.request<Paginated<ContactDto>>(`/contacts?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}
