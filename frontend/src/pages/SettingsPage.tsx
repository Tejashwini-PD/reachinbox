import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Hash,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { slackService } from '../services/slack.service';
import { senderService } from '../services/sender.service';
import { emailService } from '../services/email.service';
import { getApiErrorMessage } from '../services/api';
import { notifyEmailsChanged } from '../hooks/useEmailCounts';
import type { Sender, SlackStatus } from '../types';
import { Spinner } from '../components/Spinner';

interface SenderFormState {
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
}

const emptySenderForm: SenderFormState = {
  name: '',
  email: '',
  smtpHost: '',
  smtpPort: '587',
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
};

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [slack, setSlack] = useState<SlackStatus | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [showSenderForm, setShowSenderForm] = useState(false);
  const [senderForm, setSenderForm] = useState<SenderFormState>(emptySenderForm);
  const [senderErrors, setSenderErrors] = useState<Partial<Record<keyof SenderFormState, string>>>(
    {},
  );
  const [creatingSender, setCreatingSender] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [slackStatus, senderItems] = await Promise.all([
        slackService.status(),
        senderService.list(),
      ]);
      setSlack(slackStatus);
      setSenders(senderItems);
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const status = searchParams.get('slack');
    if (status === 'connected') {
      setMessage({ type: 'success', text: 'Slack connected successfully.' });
      const next = new URLSearchParams(searchParams);
      next.delete('slack');
      next.delete('reason');
      setSearchParams(next, { replace: true });
      void load();
    } else if (status === 'error') {
      setMessage({
        type: 'error',
        text: `Slack connection failed (${searchParams.get('reason') ?? 'unknown error'}).`,
      });
      const next = new URLSearchParams(searchParams);
      next.delete('slack');
      next.delete('reason');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  function connectSlack() {
    window.location.href = slackService.connectUrl(`${window.location.origin}/settings`);
  }

  async function disconnectSlack() {
    setBusy(true);
    setMessage(null);
    try {
      await slackService.disconnect();
      await load();
      setMessage({ type: 'success', text: 'Slack disconnected.' });
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function reindexSearch() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await emailService.reindex();
      setMessage({
        type: 'success',
        text: `Reindexed ${result.indexed} of ${result.total} email(s)${
          result.failed ? `, ${result.failed} failed` : ''
        }.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  function updateSenderField<K extends keyof SenderFormState>(
    key: K,
    value: SenderFormState[K],
  ) {
    setSenderForm((current) => ({ ...current, [key]: value }));
    setSenderErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateSenderForm(): boolean {
    const next: Partial<Record<keyof SenderFormState, string>> = {};
    if (!senderForm.name.trim()) next.name = 'Required';
    if (!senderForm.email.trim()) next.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderForm.email.trim()))
      next.email = 'Enter a valid email';
    if (!senderForm.smtpHost.trim()) next.smtpHost = 'Required';
    const port = Number(senderForm.smtpPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) next.smtpPort = '1–65535';
    if (!senderForm.smtpUser.trim()) next.smtpUser = 'Required';
    if (!senderForm.smtpPass) next.smtpPass = 'Required';
    setSenderErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleCreateSender(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validateSenderForm()) return;

    setCreatingSender(true);
    try {
      const created = await senderService.create({
        name: senderForm.name.trim(),
        email: senderForm.email.trim(),
        smtpHost: senderForm.smtpHost.trim(),
        smtpPort: Number(senderForm.smtpPort),
        smtpSecure: senderForm.smtpSecure,
        smtpUser: senderForm.smtpUser.trim(),
        smtpPass: senderForm.smtpPass,
      });
      setSenders((current) => [...current, created]);
      setSenderForm(emptySenderForm);
      setShowSenderForm(false);
      notifyEmailsChanged();
      setMessage({
        type: 'success',
        text: `Sender ${created.email} added. It is now available in the compose form.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setCreatingSender(false);
    }
  }

  return (
    <div className="space-y-5">
      {message && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'bg-rose-50 text-rose-700'
              : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          <div className="flex items-start gap-2">
            {message.type === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>{message.text}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-0.5 opacity-70 hover:opacity-100"
            onClick={() => setMessage(null)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4A154B]/10 text-[#4A154B]">
              <Hash className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Slack notifications</h2>
              <p className="mt-0.5 max-w-xl text-sm text-slate-500">
                A real Slack message is posted when a sender reaches its hourly limit.
              </p>
            </div>
          </div>
          {loading ? (
            <Spinner className="h-5 w-5 text-slate-400" />
          ) : slack?.connected ? (
            <button className="btn-secondary" type="button" onClick={disconnectSlack} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Disconnect
            </button>
          ) : (
            <button
              className="btn-primary"
              type="button"
              onClick={connectSlack}
              disabled={busy || Boolean(slack && !slack.configured)}
            >
              <MessageSquare className="h-4 w-4" />
              Connect Slack
            </button>
          )}
        </div>

        {slack && !slack.configured && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Slack OAuth is not configured. Set{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">SLACK_CLIENT_ID</code>,{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">SLACK_CLIENT_SECRET</code> and{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">SLACK_REDIRECT_URI</code> in{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">backend/.env</code>, then restart
              the API.
            </p>
          </div>
        )}

        <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Status
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {slack?.connected ? 'Connected' : 'Not connected'}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Workspace
            </p>
            <p className="mt-1 font-medium text-slate-800">{slack?.teamName ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Alert channel
            </p>
            <p className="mt-1 font-medium text-slate-800">
              {slack?.notificationChannelConfigured ? 'Configured' : 'Not configured'}
            </p>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Senders</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Shared senders come from environment variables. Personal SMTP credentials are
                encrypted with AES-256-GCM before storage.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowSenderForm((current) => !current)}
          >
            <Plus className="h-4 w-4" />
            Add sender
            {showSenderForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showSenderForm && (
          <form onSubmit={handleCreateSender} className="mt-5 rounded-xl border border-black/[0.07] bg-slate-50/60 p-4">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Server className="h-4 w-4 text-brand-600" />
              New SMTP sender
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="sender-name">
                  Display name
                </label>
                <input
                  id="sender-name"
                  className={`input ${senderErrors.name ? 'border-rose-400' : ''}`}
                  value={senderForm.name}
                  onChange={(event) => updateSenderField('name', event.target.value)}
                  placeholder="Outreach team"
                />
                {senderErrors.name && <p className="mt-1 text-xs text-rose-600">{senderErrors.name}</p>}
              </div>
              <div>
                <label className="label" htmlFor="sender-email">
                  From email
                </label>
                <input
                  id="sender-email"
                  type="email"
                  className={`input ${senderErrors.email ? 'border-rose-400' : ''}`}
                  value={senderForm.email}
                  onChange={(event) => updateSenderField('email', event.target.value)}
                  placeholder="you@company.com"
                />
                {senderErrors.email && (
                  <p className="mt-1 text-xs text-rose-600">{senderErrors.email}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="smtp-host">
                  SMTP host
                </label>
                <input
                  id="smtp-host"
                  className={`input ${senderErrors.smtpHost ? 'border-rose-400' : ''}`}
                  value={senderForm.smtpHost}
                  onChange={(event) => updateSenderField('smtpHost', event.target.value)}
                  placeholder="smtp.example.com"
                />
                {senderErrors.smtpHost && (
                  <p className="mt-1 text-xs text-rose-600">{senderErrors.smtpHost}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="smtp-port">
                  Port
                </label>
                <input
                  id="smtp-port"
                  type="number"
                  className={`input ${senderErrors.smtpPort ? 'border-rose-400' : ''}`}
                  value={senderForm.smtpPort}
                  onChange={(event) => updateSenderField('smtpPort', event.target.value)}
                />
                {senderErrors.smtpPort && (
                  <p className="mt-1 text-xs text-rose-600">{senderErrors.smtpPort}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="smtp-user">
                  SMTP username
                </label>
                <input
                  id="smtp-user"
                  className={`input ${senderErrors.smtpUser ? 'border-rose-400' : ''}`}
                  value={senderForm.smtpUser}
                  onChange={(event) => updateSenderField('smtpUser', event.target.value)}
                  autoComplete="off"
                />
                {senderErrors.smtpUser && (
                  <p className="mt-1 text-xs text-rose-600">{senderErrors.smtpUser}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="smtp-pass">
                  SMTP password
                </label>
                <input
                  id="smtp-pass"
                  type="password"
                  className={`input ${senderErrors.smtpPass ? 'border-rose-400' : ''}`}
                  value={senderForm.smtpPass}
                  onChange={(event) => updateSenderField('smtpPass', event.target.value)}
                  autoComplete="new-password"
                />
                {senderErrors.smtpPass && (
                  <p className="mt-1 text-xs text-rose-600">{senderErrors.smtpPass}</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={senderForm.smtpSecure}
                  onChange={(event) => updateSenderField('smtpSecure', event.target.checked)}
                />
                Use TLS/SSL (port 465)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowSenderForm(false);
                    setSenderForm(emptySenderForm);
                    setSenderErrors({});
                  }}
                  disabled={creatingSender}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creatingSender}>
                  {creatingSender ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Save sender
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <Spinner className="h-4 w-4" />
              Loading senders…
            </div>
          ) : senders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">No active senders configured</p>
              <p className="mt-1 text-xs text-slate-500">
                Add a personal sender above, or set <code>SENDER_1_*</code> in backend/.env.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {senders.map((sender) => (
                <li key={sender.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                      {sender.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{sender.name}</p>
                      <p className="truncate text-xs text-slate-500">{sender.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {sender.isShared ? 'shared' : 'personal'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
            <Database className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Elasticsearch recovery</h2>
            <p className="mt-0.5 max-w-xl text-sm text-slate-500">
              Rebuild the search index from PostgreSQL if Elasticsearch was offline. PostgreSQL
              remains the source of truth.
            </p>
          </div>
        </div>
        <button className="btn-secondary" type="button" onClick={reindexSearch} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reindex emails
        </button>
      </section>
    </div>
  );
}
