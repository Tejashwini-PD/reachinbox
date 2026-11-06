import { Ban, Check, Clock3, Loader2, X } from 'lucide-react';
import type { EmailStatus } from '../types';
import { statusLabel } from '../utils/format';

const styles: Record<EmailStatus, { className: string; icon: typeof Clock3 }> = {
  SCHEDULED: { className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70', icon: Clock3 },
  PENDING: { className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70', icon: Clock3 },
  PROCESSING: { className: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200/70', icon: Loader2 },
  SENT: { className: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/70', icon: Check },
  FAILED: { className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70', icon: X },
  CANCELLED: { className: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/70', icon: Ban },
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  const style = styles[status] ?? styles.SCHEDULED;
  const Icon = style.icon;
  return (
    <span className={`pill ${style.className}`}>
      <Icon className={`h-3.5 w-3.5 ${status === 'PROCESSING' ? 'animate-spin' : ''}`} />
      {statusLabel(status)}
    </span>
  );
}
