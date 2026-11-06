import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Inbox,
  MailPlus,
  RefreshCw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { EmailRow } from '../components/EmailRow';
import { EmailDetailDrawer } from '../components/EmailDetailDrawer';
import { EmptyState } from '../components/EmptyState';
import { Spinner } from '../components/Spinner';
import { emailService } from '../services/email.service';
import { getApiErrorMessage } from '../services/api';
import { useEmailCounts, notifyEmailsChanged } from '../hooks/useEmailCounts';
import type { EmailRecord, SearchEmailRecord } from '../types';
import { formatShortDateTime } from '../utils/format';

type Tab = 'scheduled' | 'sent';
type SentFilter = 'all' | 'SENT' | 'FAILED';
const PAGE_SIZE = 20;

function mapSearchRecord(item: SearchEmailRecord): EmailRecord {
  return {
    id: item.emailId,
    campaignId: item.campaignId,
    recipient: item.recipient,
    recipientName: item.recipientName,
    subject: item.subject,
    status: item.status,
    scheduledAt: item.scheduledAt,
    sentAt: item.sentAt,
    attempts: 0,
    lastError: null,
    messageId: null,
    previewUrl: null,
    senderId: item.senderId,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    sender: { id: item.senderId, name: item.senderName, email: item.senderEmail },
    body: item.body,
  };
}

function sortEmails(items: EmailRecord[], tab: Tab): EmailRecord[] {
  return [...items].sort((a, b) => {
    if (tab === 'scheduled') {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    }
    const aTime = new Date(a.sentAt ?? a.scheduledAt).getTime();
    const bTime = new Date(b.sentAt ?? b.scheduledAt).getTime();
    return bTime - aTime;
  });
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'sent' ? 'sent' : 'scheduled';
  const { counts } = useEmailCounts();

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [sentFilter, setSentFilter] = useState<SentFilter>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<EmailRecord[]>([]);
  const [allItems, setAllItems] = useState<EmailRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchSource, setSearchSource] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const successMessage = searchParams.get('scheduled')
    ? 'Emails scheduled successfully.'
    : searchParams.get('sent')
      ? 'Campaign completed. Check the sent list for delivery results.'
      : null;

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSearchSource(null);
    setTruncated(false);

    try {
      if (query.trim()) {
        const searchStatus =
          tab === 'sent' && sentFilter !== 'all' ? sentFilter : undefined;
        const result = await emailService.search({
          q: query.trim(),
          page: 1,
          limit: 100,
          ...(searchStatus ? { status: searchStatus } : {}),
        });
        let mapped = result.items.map(mapSearchRecord);
        if (tab === 'scheduled') {
          mapped = mapped.filter((email) =>
            ['SCHEDULED', 'PENDING', 'PROCESSING'].includes(email.status),
          );
        } else if (sentFilter === 'all') {
          mapped = mapped.filter((email) => ['SENT', 'FAILED', 'PROCESSING'].includes(email.status));
        } else {
          mapped = mapped.filter((email) => email.status === sentFilter);
        }
        const sorted = sortEmails(mapped, tab);
        setAllItems(sorted);
        setSearchSource(result.source);
        setTotal(sorted.length);
        setTotalPages(Math.ceil(sorted.length / PAGE_SIZE));
        setTruncated(result.pagination.total > result.items.length);
        setItems(sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      } else if (tab === 'scheduled') {
        const result = await emailService.scheduled({ page, limit: PAGE_SIZE });
        setItems(sortEmails(result.items, 'scheduled'));
        setAllItems([]);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      } else if (sentFilter === 'all') {
        const [sent, failed] = await Promise.all([
          emailService.sent({ page: 1, limit: 100 }),
          emailService.failed({ page: 1, limit: 100 }),
        ]);
        const combined = sortEmails([...sent.items, ...failed.items], 'sent');
        setAllItems(combined);
        setTotal(combined.length);
        setTotalPages(Math.ceil(combined.length / PAGE_SIZE));
        setTruncated(sent.pagination.total + failed.pagination.total > combined.length);
        setItems(combined.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      } else {
        const fetcher = sentFilter === 'SENT' ? emailService.sent : emailService.failed;
        const result = await fetcher({ page, limit: PAGE_SIZE });
        setItems(sortEmails(result.items, 'sent'));
        setAllItems([]);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
      setItems([]);
      setAllItems([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [page, query, sentFilter, tab]);

  useEffect(() => {
    void fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    setPage(1);
    setSearchInput('');
    setQuery('');
    setSentFilter('all');
  }, [tab]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('scheduled');
      next.delete('sent');
      setSearchParams(next, { replace: true });
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [searchParams, setSearchParams, successMessage]);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    setQuery('');
    setPage(1);
  }

  function changeFilter(filter: SentFilter) {
    setSentFilter(filter);
    setPage(1);
  }

  function dismissSuccess() {
    const next = new URLSearchParams(searchParams);
    next.delete('scheduled');
    next.delete('sent');
    setSearchParams(next, { replace: true });
  }

  function refreshAll() {
    void fetchEmails();
    notifyEmailsChanged();
  }

  const title = tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails';
  const subtitle =
    tab === 'scheduled'
      ? 'Upcoming sends, including queued and processing jobs.'
      : 'Delivered and failed emails with their latest status.';

  const visibleRange = useMemo(() => {
    if (total === 0) return '0 emails';
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return `${start}–${end} of ${total}`;
  }, [page, total]);

  return (
    <div className="space-y-5">
      {successMessage && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p>{successMessage}</p>
          <button
            type="button"
            className="rounded-full p-0.5 text-emerald-700 hover:bg-emerald-100"
            onClick={dismissSuccess}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Link to="/compose" className="btn-primary">
          <MailPlus className="h-4 w-4" />
          Compose email
        </Link>
      </div>

      <div className="flex items-center gap-1 border-b border-black/[0.07]">
        <Link
          to="/dashboard?tab=scheduled"
          className={`relative inline-flex items-center gap-2 px-3 pb-3 pt-1 text-sm font-semibold transition ${
            tab === 'scheduled' ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Inbox className="h-4 w-4" />
          Scheduled
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              tab === 'scheduled' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {counts.scheduled}
          </span>
          {tab === 'scheduled' && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
          )}
        </Link>
        <Link
          to="/dashboard?tab=sent"
          className={`relative inline-flex items-center gap-2 px-3 pb-3 pt-1 text-sm font-semibold transition ${
            tab === 'sent' ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Send className="h-4 w-4" />
          Sent
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              tab === 'sent' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {counts.sent}
          </span>
          {tab === 'sent' && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />
          )}
        </Link>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form onSubmit={handleSearch} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="input pl-10 pr-20"
            placeholder="Search recipient, subject, body or sender…"
            aria-label="Search emails"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {searchInput && (
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="submit"
              className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-700"
            >
              Search
            </button>
          </div>
        </form>

        {tab === 'sent' && (
          <div className="flex items-center gap-1 rounded-full border border-black/[0.08] bg-white p-1">
            {(
              [
                { value: 'all', label: 'All', count: counts.sent + counts.failed },
                { value: 'SENT', label: 'Sent', count: counts.sent },
                { value: 'FAILED', label: 'Failed', count: counts.failed },
              ] as Array<{ value: SentFilter; label: string; count: number }>
            ).map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => changeFilter(filter.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  sentFilter === filter.value
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {filter.label}
                <span
                  className={`text-[10px] ${
                    sentFilter === filter.value ? 'text-white/70' : 'text-slate-400'
                  }`}
                >
                  {filter.count}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={refreshAll}
          disabled={loading}
        >
          {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          <span>{visibleRange}</span>
          {query && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              “{query}”
            </span>
          )}
          {searchSource && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              {searchSource}
            </span>
          )}
        </div>
        {truncated && <span>Showing the most recent 100 matches.</span>}
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
          <button type="button" className="font-semibold underline underline-offset-2" onClick={fetchEmails}>
            Try again
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-black/[0.05]">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                <div className="skeleton h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-3.5 w-40" />
                  <div className="skeleton h-3 w-64 max-w-full" />
                  <div className="skeleton h-3 w-32" />
                </div>
                <div className="skeleton h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          query ? (
            <EmptyState
              icon={Search}
              title="No matching emails"
              description={`Nothing matched “${query}” in this tab. Try a different recipient, subject or sender.`}
              action={
                <button type="button" className="btn-secondary" onClick={clearSearch}>
                  Clear search
                </button>
              }
            />
          ) : tab === 'scheduled' ? (
            <EmptyState
              icon={Inbox}
              title="No scheduled emails"
              description="Compose a batch and it will appear here with its queue status and scheduled time."
              action={
                <Link to="/compose" className="btn-primary">
                  <MailPlus className="h-4 w-4" />
                  Compose email
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={Send}
              title="No sent emails yet"
              description="Delivered and failed emails will appear here once the worker processes the queue."
              action={
                <Link to="/compose" className="btn-primary">
                  <MailPlus className="h-4 w-4" />
                  Schedule an email
                </Link>
              }
            />
          )
        ) : (
          <div>
            {items.map((email) => (
              <EmailRow key={email.id} email={email} onOpen={(item) => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary px-3 py-2"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {allItems.length > 0 && totalPages <= 1 && !loading && (
        <p className="text-center text-[11px] text-slate-400">
          Latest updated {formatShortDateTime(new Date().toISOString())}
        </p>
      )}

      {selectedId && (
        <EmailDetailDrawer
          emailId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void fetchEmails()}
        />
      )}
    </div>
  );
}
