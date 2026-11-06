import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../lib/logger';

export interface SmtpSender {
  id: string;
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
  previewUrl: string | null;
}

const transporters = new Map<string, Transporter>();

function transporterKey(sender: SmtpSender): string {
  return crypto
    .createHash('sha256')
    .update(
      [sender.id, sender.smtpHost, sender.smtpPort, sender.smtpSecure, sender.smtpUser, sender.smtpPass].join(
        '|',
      ),
    )
    .digest('hex');
}

function getTransporter(sender: SmtpSender): Transporter {
  const key = transporterKey(sender);
  const existing = transporters.get(key);
  if (existing) return existing;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpSecure,
    auth: { user: sender.smtpUser, pass: sender.smtpPass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  transporters.set(key, transporter);
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sends through the configured SMTP server. A send is only considered
 * successful after Nodemailer/SMTP accepts the message. For Ethereal sandbox
 * accounts the preview URL is returned so it can be stored in PostgreSQL.
 */
export async function sendEmail(sender: SmtpSender, input: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getTransporter(sender);
  const from = `"${sender.name.replace(/"/g, '')}" <${sender.email}>`;
  const to = input.toName ? `"${input.toName.replace(/"/g, '')}" <${input.to}>` : input.to;

  const info = await transporter.sendMail({
    from,
    to,
    subject: input.subject,
    text: input.text,
    html: `<div style="white-space:pre-wrap">${escapeHtml(input.text)}</div>`,
  });

  // getTestMessageUrl returns false for non-Ethereal SMTP servers.
  const preview = nodemailer.getTestMessageUrl(info);
  const previewUrl = typeof preview === 'string' ? preview : null;

  logger.info(
    { senderId: sender.id, recipient: input.to, messageId: info.messageId, previewUrl },
    'SMTP accepted email',
  );

  return {
    messageId: info.messageId,
    response: info.response ?? '',
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
    previewUrl,
  };
}

const TRANSIENT_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'ESOCKET',
  'ECONNRESET',
  'EPIPE',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
]);

/**
 * Auth/envelope errors are permanent. Connection and 4xx SMTP responses are
 * treated as transient so BullMQ can retry them with backoff.
 */
export function isTransientSmtpError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const err = error as { code?: string; responseCode?: number; command?: string };

  if (err.code && TRANSIENT_CODES.has(err.code)) return true;
  if (err.code === 'EAUTH' || err.code === 'EENVELOPE') return false;
  if (typeof err.responseCode === 'number') {
    return err.responseCode >= 400 && err.responseCode < 500;
  }
  // Unknown errors are retried a bounded number of times by BullMQ.
  return true;
}
