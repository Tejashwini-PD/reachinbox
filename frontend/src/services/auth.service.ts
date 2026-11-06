import { API_ORIGIN, api } from './api';
import type { AuthConfig, User } from '../types';

export const authService = {
  async me(): Promise<User> {
    const { data } = await api.get<{ user: User }>('/auth/me');
    return data.user;
  },

  async config(): Promise<AuthConfig> {
    const { data } = await api.get<AuthConfig>('/auth/config');
    return data;
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
  },

  googleLoginUrl(returnTo: string): string {
    return `${API_ORIGIN}/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  },
};
