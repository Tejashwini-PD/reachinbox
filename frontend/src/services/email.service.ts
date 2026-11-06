import { api } from './api';
import type {
  EmailDetail,
  EmailRecord,
  ListResponse,
  SchedulePayload,
  ScheduleResponse,
  SearchResponse,
} from '../types';

export interface ListEmailsParams {
  page?: number;
  limit?: number;
  status?: string;
  campaignId?: string;
  recipient?: string;
}

export const emailService = {
  async schedule(payload: SchedulePayload, idempotencyKey?: string) {
    const { data } = await api.post<ScheduleResponse>('/emails/schedule', payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
    return data;
  },

  async list(params: ListEmailsParams = {}) {
    const { data } = await api.get<ListResponse<EmailRecord>>('/emails', { params });
    return data;
  },

  async scheduled(params: ListEmailsParams = {}) {
    const { data } = await api.get<ListResponse<EmailRecord>>('/emails/scheduled', { params });
    return data;
  },

  async sent(params: ListEmailsParams = {}) {
    const { data } = await api.get<ListResponse<EmailRecord>>('/emails/sent', { params });
    return data;
  },

  async failed(params: ListEmailsParams = {}) {
    const { data } = await api.get<ListResponse<EmailRecord>>('/emails/failed', { params });
    return data;
  },

  async get(emailId: string) {
    const { data } = await api.get<{ email: EmailDetail }>(`/emails/${emailId}`);
    return data.email;
  },

  async cancel(emailId: string) {
    const { data } = await api.post<{ email: EmailRecord }>(`/emails/${emailId}/cancel`);
    return data.email;
  },

  async search(params: Record<string, string | number | undefined>) {
    const { data } = await api.get<SearchResponse>('/search/emails', { params });
    return data;
  },

  async reindex() {
    const { data } = await api.post<{ indexed: number; failed: number; total: number }>(
      '/search/reindex',
    );
    return data;
  },
};
