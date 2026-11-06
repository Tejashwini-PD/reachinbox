import { api } from './api';
import type { Sender } from '../types';

export interface CreateSenderPayload {
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}

export const senderService = {
  async list(): Promise<Sender[]> {
    const { data } = await api.get<{ items: Sender[] }>('/senders');
    return data.items;
  },

  async create(payload: CreateSenderPayload): Promise<Sender> {
    const { data } = await api.post<{ sender: Sender }>('/senders', payload);
    return data.sender;
  },

  async update(senderId: string, payload: Partial<CreateSenderPayload> & { isActive?: boolean }) {
    const { data } = await api.patch<{ sender: Sender }>(`/senders/${senderId}`, payload);
    return data.sender;
  },
};
