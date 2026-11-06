import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bold,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  Italic,
  Link2,
  List,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Underline,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { emailService } from '../services/email.service';
import { senderService } from '../services/sender.service';
import { getApiErrorMessage } from '../services/api';
import { dedupeRecipients, isValidEmail, parseRecipientsFile } from '../utils/csv';
import type { RecipientInput, ScheduleResponse, Sender } from '../types';
import { Spinner } from './Spinner';

function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartAt(): string {
  return toLocalInputValue(new Date(Date.now() + 5 * 60_000));
}

function tomorrowMorning(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toLocalInputValue(date);
}

function inOneHour(): string {
  return toLocalInputValue(new Date(Date.now() + 60 * 60_000));
}

type FieldErrors = Partial<
  Record<'senderId' | 'subject' | 'body' | 'recipients' | 'startAt' | 'delay' | 'hourlyLimit', string>
>;

export function ScheduleForm({
  onScheduled,
}: {
  onScheduled?: (result: ScheduleResponse) => void;
}) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [sendersLoading, setSendersLoading] = useState(true);
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipients, setRecipients] = useState<RecipientInput[]>([]);
  const [recipientInput, setRecipientInput] = useState('');
  const [startAt, setStartAt] = useState(defaultStartAt);
  const [delaySeconds, setDelaySeconds] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('200');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null,
  );
  const [success, setSuccess] = useState<ScheduleResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    senderService
      .list()
      .then((items) => {
        setSenders(items);
        if (items[0]) setSenderId(items[0].id);
      })
      .catch((error) => setMessage({ type: 'error', text: getApiErrorMessage(error) }))
      .finally(() => setSendersLoading(false));
  }, []);

  function addRecipientValues(raw: string) {
    const parts = raw
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const invalid = parts.filter((value) => !isValidEmail(value));
    const next = dedupeRecipients([
      ...recipients,
      ...parts.filter((value) => isValidEmail(value)).map((email) => ({ email })),
    ]);
    setRecipients(next);
    setRecipientInput('');
    setErrors((current) => ({ ...current, recipients: undefined }));
    if (invalid.length > 0) {
      setMessage({
        type: 'error',
        text: `Ignored ${invalid.length} invalid email${invalid.length === 1 ? '' : 's'}: ${invalid
          .slice(0, 3)
          .join(', ')}${invalid.length > 3 ? '…' : ''}`,
      });
    } else {
      setMessage(null);
    }
  }

  function handleRecipientKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      addRecipientValues(recipientInput);
    }
    if (event.key === 'Backspace' && recipientInput === '' && recipients.length > 0) {
      setRecipients((current) => current.slice(0, -1));
    }
  }

  function removeRecipient(email: string) {
    setRecipients((current) => current.filter((recipient) => recipient.email !== email));
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseRecipientsFile(file);
      if (parsed.length === 0) {
        setMessage({
          type: 'error',
          text: 'No valid email addresses were found in that file.',
        });
        return;
      }
      setRecipients((current) => dedupeRecipients([...current, ...parsed]));
      setErrors((current) => ({ ...current, recipients: undefined }));
      setMessage({
        type: 'success',
        text: `Loaded ${parsed.length} recipient${parsed.length === 1 ? '' : 's'} from ${file.name}.`,
      });
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      event.target.value = '';
    }
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!senderId) next.senderId = 'Choose a sender.';
    if (!subject.trim()) next.subject = 'Add a subject.';
    if (!body.trim()) next.body = 'Write the email body.';
    if (recipients.length === 0) next.recipients = 'Add at least one recipient.';
    if (recipients.length > 2_000) next.recipients = 'A batch can contain at most 2,000 recipients.';

    const startDate = new Date(startAt);
    if (!startAt || Number.isNaN(startDate.getTime())) {
      next.startAt = 'Choose a valid start time.';
    }

    const delay = Number(delaySeconds);
    if (!Number.isFinite(delay) || delay < 0 || !Number.isInteger(delay)) {
      next.delay = 'Use a whole number of seconds (0 or more).';
    }

    const hourly = Number(hourlyLimit);
    if (!Number.isFinite(hourly) || hourly < 1 || !Number.isInteger(hourly)) {
      next.hourlyLimit = 'Hourly limit must be a whole number of at least 1.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSuccess(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const startDate = new Date(startAt);
      const result = await emailService.schedule(
        {
          subject: subject.trim(),
          body: body.trim(),
          recipients,
          senderId,
          startAt: startDate.toISOString(),
          delayMs: Number(delaySeconds) * 1_000,
          hourlyLimit: Number(hourlyLimit),
        },
        idempotencyKey,
      );
      setSuccess(result);
      setMessage({
        type: 'success',
        text: `Scheduled ${result.totalRecipients} email${result.totalRecipients === 1 ? '' : 's'}${
          result.warning ? ` — ${result.warning}` : '.'
        }`,
      });
      setIdempotencyKey(crypto.randomUUID());
      setRecipients([]);
      setSubject('');
      setBody('');
      onScheduled?.(result);
    } catch (error) {
      setMessage({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSubject('');
    setBody('');
    setRecipients([]);
    setRecipientInput('');
    setStartAt(defaultStartAt());
    setDelaySeconds('2');
    setHourlyLimit('200');
    setErrors({});
    setMessage(null);
    setSuccess(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  const startDate = new Date(startAt);
  const startsInPast = !Number.isNaN(startDate.getTime()) && startDate.getTime() < Date.now();
  const visibleRecipients = recipients.slice(0, 5);

  return (
    <form className="card overflow-hidden" onSubmit={handleSubmit} noValidate>
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900">New message</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Every recipient becomes a persistent, rate-limited queue job.
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-100 sm:inline-flex">
          <Sparkles className="h-3.5 w-3.5" />
          Scheduled delivery
        </span>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {message && (
          <div
            className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${
              message.type === 'error'
                ? 'bg-rose-50 text-rose-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {message.type === 'error' ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="flex-1">
              <p>{message.text}</p>
              {success && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to="/dashboard?tab=scheduled"
                    className="font-semibold text-emerald-800 underline underline-offset-2"
                  >
                    View scheduled emails
                  </Link>
                  <button
                    type="button"
                    className="font-semibold text-emerald-800 underline underline-offset-2"
                    onClick={resetForm}
                  >
                    Schedule another
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="sender">
              From
            </label>
            <select
              id="sender"
              className={`input ${errors.senderId ? 'border-rose-400 focus:ring-rose-100' : ''}`}
              value={senderId}
              onChange={(event) => {
                setSenderId(event.target.value);
                setErrors((current) => ({ ...current, senderId: undefined }));
              }}
              disabled={sendersLoading || senders.length === 0}
            >
              <option value="">
                {sendersLoading ? 'Loading senders…' : 'Select a sender'}
              </option>
              {senders.map((sender) => (
                <option key={sender.id} value={sender.id}>
                  {sender.name} — {sender.email}
                </option>
              ))}
            </select>
            {errors.senderId && <p className="mt-1 text-xs text-rose-600">{errors.senderId}</p>}
          </div>
          {sendersLoading ? (
            <div className="flex items-center gap-2 pb-3 text-xs text-slate-500">
              <Spinner className="h-3.5 w-3.5" />
              Loading
            </div>
          ) : senders.length === 0 ? (
            <Link to="/settings" className="pb-3 text-xs font-semibold text-brand-700">
              Add a sender →
            </Link>
          ) : null}
        </div>

        {!sendersLoading && senders.length === 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              No sender is configured. Add an SMTP sender in Settings, or set{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">SENDER_1_*</code> variables in{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">backend/.env</code> and restart the
              API.
            </p>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="label mb-0" htmlFor="recipients">
              To
            </label>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {recipients.length} detected
            </span>
          </div>
          <div
            className={`flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-xl border bg-white px-2.5 py-2 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100/70 ${
              errors.recipients ? 'border-rose-400' : 'border-black/10'
            }`}
          >
            {visibleRecipients.map((recipient) => (
              <span
                key={recipient.email}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700"
              >
                <span className="max-w-[180px] truncate">{recipient.email}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                  onClick={() => removeRecipient(recipient.email)}
                  aria-label={`Remove ${recipient.email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {recipients.length > visibleRecipients.length && (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                +{recipients.length - visibleRecipients.length}
              </span>
            )}
            <input
              id="recipients"
              value={recipientInput}
              onChange={(event) => setRecipientInput(event.target.value)}
              onKeyDown={handleRecipientKeyDown}
              onBlur={() => recipientInput.trim() && addRecipientValues(recipientInput)}
              placeholder={recipients.length === 0 ? 'name@company.com, another@company.com' : 'Add another…'}
              className="min-w-[180px] flex-1 border-0 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-slate-400"
              aria-describedby="recipient-help"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-black/20 hover:bg-slate-50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload list
            </button>
          </div>
          <p id="recipient-help" className="mt-1.5 text-[11px] text-slate-400">
            Press Enter or comma after each address. CSV and TXT files are supported.
          </p>
          {errors.recipients && (
            <p className="mt-1 text-xs text-rose-600">{errors.recipients}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="subject">
            Subject
          </label>
          <input
            id="subject"
            className={`input ${errors.subject ? 'border-rose-400 focus:ring-rose-100' : ''}`}
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setErrors((current) => ({ ...current, subject: undefined }));
            }}
            placeholder="A short, useful subject line"
            maxLength={255}
          />
          <div className="mt-1 flex items-center justify-between">
            {errors.subject ? (
              <p className="text-xs text-rose-600">{errors.subject}</p>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-slate-400">{subject.length}/255</span>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="body">
            Message
          </label>
          <div
            className={`overflow-hidden rounded-xl border bg-white transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100/70 ${
              errors.body ? 'border-rose-400' : 'border-black/10'
            }`}
          >
            <div className="flex items-center gap-0.5 border-b border-black/[0.06] bg-slate-50/70 px-2 py-1.5">
              {[Bold, Italic, Underline, List, Link2, Paperclip].map((Icon, index) => (
                <button
                  key={index}
                  type="button"
                  disabled
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400"
                  title="Rich formatting and attachments are not supported. Emails are sent as plain text."
                  aria-label="Formatting unavailable"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              <span className="ml-auto pr-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Plain text
              </span>
            </div>
            <textarea
              id="body"
              className="min-h-44 w-full resize-y border-0 bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-slate-400"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setErrors((current) => ({ ...current, body: undefined }));
              }}
              placeholder={'Hi there,\n\nWrite your message here…'}
            />
          </div>
          {errors.body ? (
            <p className="mt-1 text-xs text-rose-600">{errors.body}</p>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">
              Plain text is sent as both text and escaped HTML.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-black/[0.06] bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-slate-900">Sending schedule</h3>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="label" htmlFor="startAt">
                Start time
              </label>
              <input
                id="startAt"
                type="datetime-local"
                className={`input ${errors.startAt ? 'border-rose-400 focus:ring-rose-100' : ''}`}
                value={startAt}
                onChange={(event) => {
                  setStartAt(event.target.value);
                  setErrors((current) => ({ ...current, startAt: undefined }));
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-black/20"
                  onClick={() => setStartAt(inOneHour())}
                >
                  In 1 hour
                </button>
                <button
                  type="button"
                  className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-black/20"
                  onClick={() => setStartAt(tomorrowMorning())}
                >
                  Tomorrow, 9:00
                </button>
                {startsInPast && (
                  <span className="text-[11px] font-medium text-amber-700">
                    This time is in the past; sending will start immediately.
                  </span>
                )}
              </div>
              {errors.startAt && <p className="mt-1 text-xs text-rose-600">{errors.startAt}</p>}
            </div>

            <div>
              <label className="label" htmlFor="delay">
                Delay between emails
              </label>
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="delay"
                  type="number"
                  min={0}
                  step={1}
                  className={`input pl-9 ${errors.delay ? 'border-rose-400' : ''}`}
                  value={delaySeconds}
                  onChange={(event) => {
                    setDelaySeconds(event.target.value);
                    setErrors((current) => ({ ...current, delay: undefined }));
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  sec
                </span>
              </div>
              {errors.delay && <p className="mt-1 text-xs text-rose-600">{errors.delay}</p>}
            </div>

            <div>
              <label className="label" htmlFor="hourlyLimit">
                Hourly sending limit
              </label>
              <div className="relative">
                <Gauge className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="hourlyLimit"
                  type="number"
                  min={1}
                  step={1}
                  className={`input pl-9 ${errors.hourlyLimit ? 'border-rose-400' : ''}`}
                  value={hourlyLimit}
                  onChange={(event) => {
                    setHourlyLimit(event.target.value);
                    setErrors((current) => ({ ...current, hourlyLimit: undefined }));
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  / hr
                </span>
              </div>
              {errors.hourlyLimit && (
                <p className="mt-1 text-xs text-rose-600">{errors.hourlyLimit}</p>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-white p-3 text-[11px] leading-relaxed text-slate-500 ring-1 ring-black/[0.05] sm:col-span-1">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <span>
                {recipients.length} email{recipients.length === 1 ? '' : 's'} will be paced with at
                least {Number(delaySeconds) || 0}s between sends and capped at{' '}
                {Number(hourlyLimit) || 0}/hour.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] bg-slate-50/50 px-5 py-4 sm:px-6">
        <p className="text-[11px] text-slate-400">
          Jobs survive API and worker restarts. Rate limits are enforced in Redis.
        </p>
        <button className="btn-primary min-w-40" type="submit" disabled={submitting || senders.length === 0}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Scheduling…' : 'Schedule emails'}
        </button>
      </div>
    </form>
  );
}
