import { useCallback, useEffect, useState } from 'react';
import { emailService } from '../services/email.service';
import { getApiErrorMessage } from '../services/api';
import type { EmailRecord } from '../types';

interface EmailSummary {
  scheduled: number;
  sent: number;
  failed: number;
}

export function useEmailSummary() {
  const [summary, setSummary] = useState<EmailSummary>({ scheduled: 0, sent: 0, failed: 0 });
  const [recent, setRecent] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scheduled, sent, failed, recentScheduled] = await Promise.all([
        emailService.scheduled({ page: 1, limit: 1 }),
        emailService.sent({ page: 1, limit: 1 }),
        emailService.failed({ page: 1, limit: 1 }),
        emailService.scheduled({ page: 1, limit: 5 }),
      ]);
      setSummary({
        scheduled: scheduled.pagination.total,
        sent: sent.pagination.total,
        failed: failed.pagination.total,
      });
      setRecent(recentScheduled.items);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, recent, loading, error, refresh };
}
