import { ChevronRight, Clock3 } from 'lucide-react';
import type { EmailRecord } from '../types';
import { StatusBadge } from './StatusBadge';
import { emailInitials, formatShortDateTime, formatRelative, truncate } from '../utils/format';

function isSentLike(email: EmailRecord): boolean {
  return email.status === 'SENT' || email.status === 'FAILED' || email.status === 'PROCESSING';
}

export function EmailRow({
  email,
  onOpen,
}: {
  email: EmailRecord;
  onOpen: (email: EmailRecord) => void;
}) {
  const displayName = email.recipientName?.trim() || email.recipient;
  const time = isSentLike(email) ? email.sentAt ?? email.scheduledAt : email.scheduledAt;
  const preview = email.lastError
    ? truncate(email.lastError, 110)
    : email.body
      ? truncate(email.body.replace(/\s+/g, ' '), 110)
      : email.sender
        ? `From ${email.sender.name} <${email.sender.email}>`
        : '';

  return (
    <button
      type="button"
      onClick={() => onOpen(email)}
      className="group flex w-full items-start gap-3 border-b border-black/[0.05] px-4 py-4 text-left transition last:border-b-0 hover:bg-slate-50/70 focus:outline-none focus-visible:bg-brand-50/40 sm:px-5"
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-black/[0.03]">
        {emailInitials(email.recipient)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="max-w-full truncate text-sm font-semibold text-slate-900">
            {displayName}
          </p>
          {email.recipientName && (
            <p className="max-w-full truncate text-xs text-slate-400">{email.recipient}</p>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{email.subject}</p>
        {preview && (
          <p
            className={`mt-0.5 truncate text-xs ${
              email.lastError ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            {preview}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusBadge status={email.status} />
        <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-400">
          <Clock3 className="h-3 w-3" />
          {formatShortDateTime(time)}
          {time && <span className="hidden sm:inline">· {formatRelative(time)}</span>}
        </span>
      </div>

      <ChevronRight className="mt-2 hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 sm:block" />
    </button>
  );
}
