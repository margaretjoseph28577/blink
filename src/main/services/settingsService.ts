import { getDb } from '../db/connection';
import type { Settings } from '../../shared/types';

const NUMERIC_KEYS = new Set([
  'loan_period_days',
  'max_books_per_member',
  'fine_per_day_paise',
  'max_renewals',
  'accession_next_seq',
]);

export function getSettings(): Settings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const out: Record<string, string | number> = {};
  for (const { key, value } of rows) {
    out[key] = NUMERIC_KEYS.has(key) ? Number(value) : value;
  }
  return out as unknown as Settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === null) continue;
      stmt.run(k, String(v));
    }
  });
  tx();
  return getSettings();
}

/** Allocate the next accession number atomically. Must be called inside a transaction. */
export function nextAccessionNumber(): string {
  const db = getDb();
  const prefix =
    (db.prepare("SELECT value FROM settings WHERE key='accession_prefix'").get() as { value: string })
      ?.value ?? 'ACC';
  const seqRow = db
    .prepare("SELECT value FROM settings WHERE key='accession_next_seq'")
    .get() as { value: string };
  const seq = Number(seqRow?.value ?? '1');
  db.prepare("UPDATE settings SET value = ? WHERE key='accession_next_seq'").run(String(seq + 1));
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}
