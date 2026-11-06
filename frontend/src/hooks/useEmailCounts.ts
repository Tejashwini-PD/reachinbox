import { useCallback, useEffect, useState } from 'react';
import { emailService } from '../services/email.service';

export interface EmailCounts {
  scheduled: number;
  sent: number;
  failed: number;
}

const initialCounts: EmailCounts = { scheduled: 0, sent: 0, failed: 0 };

export function notifyEmailsChanged(): void {
  window.dispatchEvent(new Event('emails:changed'));
}

export function useEmailCounts() {
  const [counts, setCounts] = useState<EmailCounts>(initialCounts);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [scheduled, sent, failed] = await Promise.all([
        emailService.scheduled({ page: 1, limit: 1 }),
        emailService.sent({ page: 1, limit: 1 }),
        emailService.failed({ page: 1, limit: 1 }),
      ]);
      setCounts({
        scheduled: scheduled.pagination.total,
        sent: sent.pagination.total,
        failed: failed.pagination.total,
      });
    } catch {
      setCounts(initialCounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const handleChange = () => void refresh();
    window.addEventListener('emails:changed', handleChange);
    window.addEventListener('focus', handleChange);
    return () => {
      window.removeEventListener('emails:changed', handleChange);
      window.removeEventListener('focus', handleChange);
    };
  }, [refresh]);

  return { counts, loading, refresh };
}
