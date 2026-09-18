import { getDb } from '../db/connection';
import { logActivity } from './activityService';
import { getSession } from './authService';
import type { Copy, StockSummary } from '../../shared/types';

/** In-memory stock verification session (single desktop app). */
let sessionStartedAt: string | null = null;

export function beginStockSession(): void {
  sessionStartedAt = new Date().toISOString();
  logActivity(getSession()?.id ?? null, 'stock_begin', 'Stock verification started');
}

export function scanCopy(accessionNumber: string): {
  found: boolean;
  title?: string;
  accession_number?: string;
  alreadyScanned?: boolean;
} {
  if (!sessionStartedAt) throw new Error('Start a stock verification session first');
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.id, c.accession_number, c.last_verified_at, b.title
       FROM copies c JOIN books b ON b.id = c.book_id
       WHERE c.accession_number = ?`,
    )
    .get(accessionNumber.trim()) as
    | { id: number; accession_number: string; last_verified_at: string | null; title: string }
    | undefined;
  if (!row) return { found: false };
  const alreadyScanned = !!row.last_verified_at && row.last_verified_at >= sessionStartedAt;
  db.prepare('UPDATE copies SET last_verified_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id,
  );
  return { found: true, title: row.title, accession_number: row.accession_number, alreadyScanned };
}

export function getStockSummary(): StockSummary {
  const db = getDb();
  const totalActive = (
    db
      .prepare("SELECT COUNT(*) AS n FROM copies WHERE status IN ('available','on_loan')")
      .get() as { n: number }
  ).n;
  if (!sessionStartedAt) {
    return { sessionStartedAt: null, totalActive, verifiedCount: 0, missing: [] };
  }
  const verifiedCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM copies WHERE status IN ('available','on_loan') AND last_verified_at >= ?",
      )
      .get(sessionStartedAt) as { n: number }
  ).n;
  // Copies on loan are accounted for even if not scanned — they are with members.
  const missing = db
    .prepare(
      `SELECT c.*, b.title, b.authors
       FROM copies c JOIN books b ON b.id = c.book_id
       WHERE c.status = 'available'
         AND (c.last_verified_at IS NULL OR c.last_verified_at < ?)
       ORDER BY c.accession_number`,
    )
    .all(sessionStartedAt) as (Copy & { title: string; authors: string })[];
  return { sessionStartedAt, totalActive, verifiedCount, missing };
}

export function markMissingLost(copyIds: number[]): void {
  const db = getDb();
  const stmt = db.prepare("UPDATE copies SET status = 'lost' WHERE id = ? AND status = 'available'");
  const tx = db.transaction(() => {
    for (const id of copyIds) stmt.run(id);
  });
  tx();
  logActivity(
    getSession()?.id ?? null,
    'stock_lost',
    `Marked ${copyIds.length} cop${copyIds.length === 1 ? 'y' : 'ies'} as lost after stock verification`,
  );
}
