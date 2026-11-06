import axios from 'axios';

export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
});

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: { message?: string; details?: unknown } }
      | undefined;
    if (data?.error?.message) return data.error.message;
    if (error.code === 'ERR_NETWORK') return 'Cannot reach the backend API. Is it running?';
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}
