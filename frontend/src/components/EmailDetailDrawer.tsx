
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  X,
} from 'lucide-react';
import { emailService } from '../services/email.service';
import { getApiErrorMessage } from '../services/api';
import type { EmailDetail } from '../types';
import { StatusBadge } from './StatusBadge';
import { Spinner } from './Spinner';
import { emailInitials, formatDateTime } from '../utils/format';
import { notifyEmailsChanged } from '../hooks/useEmailCounts';

export function EmailDetailDrawer({
  emailId,
  onClose,
  onChanged,
}: {
  emailId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    emailService
      .get(emailId)
      .then((detail) => {
        if (active) setEmail(detail);
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [emailId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleCancel() {
    if (!email) return;
    setCancelling(true);
    setError(null);
    try {
      await emailService.cancel(email.id);
      const updated = await emailService.get(email.id);
      setEmail(updated);
      setConfirmCancel(false);
      notifyEmailsChanged();
      onChanged?.();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setCancelling(false);
    }
  }

  const canCancel = email && ['SCHEDULED', 'PENDING'].includes(email.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close email details"
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-xl animate-slide-in flex-col border-l border-black/10 bg-white shadow-pop">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Mail className="h-4 w-4 text-brand-600" />
            Email details
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <Spinner className="h-6 w-6 text-brand-600" />
              Loading email…
            </div>
          ) : error && !email ? (
            <div className="m-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : email ? (
            <div className="space-y-6 p-5">
              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100">
                    {emailInitials(email.recipient)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {email.recipientName || email.recipient}
                    </p>
                    <p className="truncate text-xs text-slate-500">{email.recipient}</p>
                  </div>
                </div>
                <StatusBadge status={email.status} />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Subject
                </p>
                <h2 className="mt-1 text-lg font-semibold leading-snug text-slate-900">
                  {email.subject}
                </h2>
              </div>

              <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">From</p>
                  <p className="mt-0.5 text-slate-700">
                    {email.sender?.name}{' '}
                    <span className="text-slate-400">&lt;{email.sender?.email}&gt;</span>
                  </p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Campaign</p>
                  <p className="mt-0.5 text-slate-700">
                    {email.campaignId ? email.campaignId.slice(0, 8) : '—'}
                    {email.campaign ? ` · ${email.campaign.status}` : ''}
                  </p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">
                    Scheduled for
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-slate-700">
                    <Clock3 className="h-3 w-3" />
                    {formatDateTime(email.scheduledAt)}
                  </p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-400">Sent at</p>
                  <p className="mt-0.5 text-slate-700">
                    {email.sentAt ? formatDateTime(email.sentAt) : 'Not sent yet'}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Message
                </p>
                <div className="whitespace-pre-wrap rounded-xl border border-black/[0.06] bg-white p-4 text-sm leading-relaxed text-slate-700">
                  {email.body}
                </div>
              </div>

              {email.lastError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Last error</p>
                    <p className="mt-0.5 break-words">{email.lastError}</p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {email.attempts} delivery attempt{email.attempts === 1 ? '' : 's'}
                </span>
                {email.status === 'SENT' && (
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Accepted by SMTP
                  </span>
                )}
                {email.previewUrl && (
                  <a
                    href={email.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Ethereal preview
                  </a>
                )}
              </div>

              {email.deliveryAttempts.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Delivery attempts
                  </p>
                  <ul className="space-y-2">
                    {email.deliveryAttempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="rounded-lg border border-black/[0.06] px-3 py-2 text-xs text-slate-600"
                      >
                        <span className="font-semibold text-slate-800">
                          Attempt {attempt.attemptNumber}
                        </span>{' '}
                        · {attempt.status} · {formatDateTime(attempt.createdAt)}
                        {attempt.error && (
                          <p className="mt-1 break-words text-rose-600">{attempt.error}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {email && canCancel && (
          <div className="border-t border-black/[0.06] p-4">
            {confirmCancel ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600">Cancel this email before it is sent?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setConfirmCancel(false)}
                    disabled={cancelling}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handleCancel}
                    disabled={cancelling}
                  >
                    {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    Confirm cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-danger w-full sm:w-auto"
                onClick={() => setConfirmCancel(true)}
              >
                <Ban className="h-4 w-4" />
                Cancel email
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
