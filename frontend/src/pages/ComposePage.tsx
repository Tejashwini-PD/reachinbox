import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock3, Gauge, ShieldCheck } from 'lucide-react';
import { ScheduleForm } from '../components/ScheduleForm';
import { notifyEmailsChanged } from '../hooks/useEmailCounts';

const facts = [
  {
    icon: Clock3,
    title: 'Delayed BullMQ jobs',
    text: 'Each recipient is queued with a persistent delay. No cron process is involved.',
  },
  {
    icon: Gauge,
    title: 'Rate-limited in Redis',
    text: 'Minimum spacing and hourly caps are enforced atomically across every worker.',
  },
  {
    icon: ShieldCheck,
    title: 'Restart-safe',
    text: 'PostgreSQL stores the source of truth; the API re-queues missing jobs on boot.',
  },
];

export function ComposePage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/dashboard?tab=scheduled"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to emails
        </Link>
        <Link to="/settings" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          Manage senders
        </Link>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <ScheduleForm onScheduled={() => notifyEmailsChanged()} />

        <aside className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">What happens next</h2>
            <ul className="mt-4 space-y-4">
              {facts.map((fact) => (
                <li key={fact.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                    <fact.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{fact.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{fact.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
              <CheckCircle2 className="h-4 w-4" />
              Honest delivery status
            </div>
            <p className="mt-2 text-xs leading-relaxed text-brand-900/70">
              The dashboard only shows what PostgreSQL and the queue actually report. If a send
              fails, the error and retry count are visible on the email detail panel.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
