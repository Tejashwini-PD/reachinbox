export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: string;
}

export interface AuthConfig {
  googleConfigured: boolean;
  slackConfigured: boolean;
  frontendUrl: string;
}

export type EmailStatus =
  | 'SCHEDULED'
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export interface Sender {
  id: string;
  name: string;
  email: string;
  isShared: boolean;
  isActive: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  campaignId: string | null;
  recipient: string;
  recipientName: string | null;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  attempts: number;
  lastError: string | null;
  messageId: string | null;
  previewUrl: string | null;
  senderId: string;
  createdAt: string;
  updatedAt: string;
  sender?: { id: string; name: string; email: string };
  body?: string;
}

export interface DeliveryAttempt {
  id: string;
  attemptNumber: number;
  status: string;
  error: string | null;
  smtpResponse: string | null;
  createdAt: string;
}

export interface EmailDetail extends EmailRecord {
  body: string;
  campaign: {
    id: string;
    status: string;
    totalRecipients: number;
    createdAt: string;
  } | null;
  deliveryAttempts: DeliveryAttempt[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface RecipientInput {
  email: string;
  name?: string;
}

export interface SchedulePayload {
  subject: string;
  body: string;
  recipients: Array<string | RecipientInput>;
  senderId: string;
  startAt: string;
  delayMs?: number;
  hourlyLimit?: number;
  idempotencyKey?: string;
}

export interface ScheduleResponse {
  campaignId: string;
  totalRecipients: number;
  emailIds: string[];
  status: string;
  warning?: string;
  idempotentReplay?: boolean;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  status: string;
  teamId?: string;
  teamName?: string | null;
  scope?: string | null;
  connectedAt?: string;
  updatedAt?: string;
  notificationChannelConfigured?: boolean;
}

export interface SearchEmailRecord {
  emailId: string;
  campaignId: string | null;
  recipient: string;
  recipientName: string | null;
  subject: string;
  body: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

export interface SearchResponse {
  items: SearchEmailRecord[];
  pagination: Pagination;
  source: string;
}
