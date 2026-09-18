import { getDb } from '../db/connection';
import { logActivity } from './activityService';
import { getSession } from './authService';
import type { FineDetail } from '../../shared/types';

export function listFines(opts: { memberId?: number; status?: string }): FineDetail[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.memberId) {
    where.push('f.member_id = :memberId');
    params.memberId = opts.memberId;
  }
  if (opts.status?.trim()) {
    where.push('f.status = :status');
    params.status = opts.status.trim();
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT f.*, m.name AS member_name, m.member_code,
              b.id AS book_id, b.title, c.accession_number
       FROM fines f
       JOIN members m ON m.id = f.member_id
       LEFT JOIN loans l ON l.id = f.loan_id
       LEFT JOIN copies c ON c.id = l.copy_id
       LEFT JOIN books b ON b.id = c.book_id
       ${whereSql}
       ORDER BY f.created_at DESC LIMIT 500`,
    )
    .all(params) as FineDetail[];
}

export function recordPayment(fineId: number, amountPaise: number, note?: string): void {
  if (amountPaise <= 0) throw new Error('Payment amount must be positive');
  const db = getDb();
  const tx = db.transaction(() => {
    const fine = db.prepare('SELECT * FROM fines WHERE id = ?').get(fineId) as
      | { id: number; amount_paise: number; amount_paid_paise: number; status: string }
      | undefined;
    if (!fine) throw new Error('Fine not found');
    if (fine.status !== 'outstanding') throw new Error(`Fine is already ${fine.status}`);
    const remaining = fine.amount_paise - fine.amount_paid_paise;
    if (amountPaise > remaining) {
      throw new Error(`Amount exceeds balance due (${remaining} paise)`);
    }
    db.prepare(
      'INSERT INTO fine_payments (fine_id, amount_paise, recorded_by, note) VALUES (?, ?, ?, ?)',
    ).run(fineId, amountPaise, getSession()?.id ?? null, note || null);
    const newPaid = fine.amount_paid_paise + amountPaise;
    db.prepare('UPDATE fines SET amount_paid_paise = ?, status = ? WHERE id = ?').run(
      newPaid,
      newPaid >= fine.amount_paise ? 'paid' : 'outstanding',
      fineId,
    );
  });
  tx();
  logActivity(getSession()?.id ?? null, 'fine_payment', `Payment of ${amountPaise} paise on fine #${fineId}`);
}

export function waiveFine(fineId: number): void {
  const db = getDb();
  const fine = db.prepare('SELECT status FROM fines WHERE id = ?').get(fineId) as
    | { status: string }
    | undefined;
  if (!fine) throw new Error('Fine not found');
  if (fine.status !== 'outstanding') throw new Error(`Fine is already ${fine.status}`);
  db.prepare("UPDATE fines SET status = 'waived' WHERE id = ?").run(fineId);
  logActivity(getSession()?.id ?? null, 'fine_waive', `Waived fine #${fineId}`);
}
