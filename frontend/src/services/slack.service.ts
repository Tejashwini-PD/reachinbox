import { API_ORIGIN, api } from './api';
import type { SlackStatus } from '../types';

export const slackService = {
  async status(): Promise<SlackStatus> {
    const { data } = await api.get<SlackStatus>('/slack/status');
    return data;
  },

  async disconnect(): Promise<void> {
    await api.post('/slack/disconnect');
  },

  connectUrl(returnTo: string): string {
    return `${API_ORIGIN}/api/slack/connect?returnTo=${encodeURIComponent(returnTo)}`;
  },
};
