import Papa from 'papaparse';
import type { RecipientInput } from '../types';

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function parsePlainText(content: string): RecipientInput[] {
  return content
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

/**
 * Parses a CSV or plain-text file with an `email` column and an optional
 * `name` column. Also accepts a headerless one-column list.
 */
export function parseRecipientsFile(file: File): Promise<RecipientInput[]> {
  const isPlainText = file.name.toLowerCase().endsWith('.txt') || file.type === 'text/plain';

  if (isPlainText) {
    return file.text().then(parsePlainText);
  }

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (result) => {
        const recipients: RecipientInput[] = [];

        for (const row of result.data) {
          const email = (row.email || row.recipient || '').trim();
          if (!email || !isValidEmail(email)) continue;
          const name = (row.name || row.fullname || row['full name'] || '').trim();
          recipients.push({ email, ...(name ? { name } : {}) });
        }

        if (recipients.length === 0) {
          for (const row of result.data) {
            const value = Object.values(row)[0]?.trim() ?? '';
            if (isValidEmail(value)) recipients.push({ email: value });
          }
        }

        resolve(recipients);
      },
      error: (error) => reject(error),
    });
  });
}

export function dedupeRecipients(recipients: RecipientInput[]): RecipientInput[] {
  const seen = new Set<string>();
  const result: RecipientInput[] = [];
  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    result.push({ email, ...(recipient.name ? { name: recipient.name.trim() } : {}) });
  }
  return result;
}
