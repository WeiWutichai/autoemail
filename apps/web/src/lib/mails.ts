import type {
  AuditLogDto,
  MailDetailDto,
  MailStatsDto,
  MailStatus,
  MailSummaryDto,
  Paginated,
  PdpaEraseResult,
} from '@erp-mail/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api-client';

const KEY = ['mails'] as const;

export interface MailFilters {
  status: MailStatus | '';
  connectionId: string;
  templateId: string;
  /** yyyy-mm-dd (local), inclusive */
  from: string;
  /** yyyy-mm-dd (local), inclusive */
  to: string;
  q: string;
  page: number;
}

export const emptyMailFilters: MailFilters = {
  status: '',
  connectionId: '',
  templateId: '',
  from: '',
  to: '',
  q: '',
  page: 1,
};

/** Query string for GET /mails; date inputs are local days, `to` is made exclusive. */
export function mailQueryString(f: MailFilters): string {
  const params = new URLSearchParams({ page: String(f.page), pageSize: '25' });
  if (f.status) params.set('status', f.status);
  if (f.connectionId) params.set('connectionId', f.connectionId);
  if (f.templateId) params.set('templateId', f.templateId);
  if (f.q) params.set('q', f.q);
  if (f.from) params.set('from', new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    params.set('to', end.toISOString());
  }
  return params.toString();
}

export function useMails(filters: MailFilters) {
  return useQuery({
    queryKey: [...KEY, 'list', filters],
    queryFn: () => api.request<Paginated<MailSummaryDto>>(`/mails?${mailQueryString(filters)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
}

export function useMailStats() {
  return useQuery({
    queryKey: [...KEY, 'stats'],
    queryFn: () => api.request<MailStatsDto>('/mails/stats'),
    refetchInterval: 15_000,
  });
}

export function useMail(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => api.request<MailDetailDto>(`/mails/${id}`),
    enabled: id !== null,
  });
}

export function useMailAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'retry' | 'cancel' }) =>
      api.request<MailDetailDto>(`/mails/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAuditLogs(action: string, page: number) {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (action) params.set('action', action);
  return useQuery({
    queryKey: ['audit-logs', action, page],
    queryFn: () => api.request<Paginated<AuditLogDto>>(`/audit-logs?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}

export function usePdpaErase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api.request<PdpaEraseResult>('/pdpa/erase', { method: 'POST', json: { email } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['contacts'] });
      void qc.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}
