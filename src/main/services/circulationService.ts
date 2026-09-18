import { getDb } from '../db/connection';
import { getSettings } from './settingsService';
import { logActivity } from './activityService';
import { getSession } from './authService';
import type { Copy, LoanDetail, Member } from '../../shared/types';

/**
 * Shared SELECT for loan rows joined with copy/book/member, including derived
 * overdue days and accruing/charged fine. Callers append WHERE/ORDER BY.
 */
export const loanDetailQuery = `
  SELECT l.*, c.accession_number, b.id AS book_id, b.title, b.authors,
         m.name AS member_name, m.member_code,
         CASE
           WHEN l.status = 'active' AND l.due_date < date('now','localtime')
             THEN CAST(julianday(date('now','localtime')) - julianday(l.due_date) AS INTEGER)
           WHEN l.status = 'returned' AND l.return_date > l.due_date
             THEN CAST(julianday(l.return_date) - julianday(l.due_date) AS INTEGER)
           ELSE 0
         END AS days_overdue,
         CASE
           WHEN l.status = 'active' AND l.due_date < date('now','localtime')
             THEN CAST(julianday(date('now','localtime')) - julianday(l.due_date) AS INTEGER)
                  * (SELECT CAST(value AS INTEGER) FROM settings WHERE key='fine_per_day_paise')
           ELSE COALESCE((SELECT f.amount_paise FROM fines f WHERE f.loan_id = l.id), 0)
         END AS accruing_fine_paise
  FROM loans l
  JOIN copies c ON c.id = l.copy_id
  JOIN books b ON b.id = c.book_id
  JOIN members m ON m.id = l.member_id
`;

export function getLoanDetail(loanId: number): LoanDetail {
  const row = getDb()
    .prepare(`${loanDetailQuery} WHERE l.id = ?`)
    .get(loanId) as LoanDetail | undefined;
  if (!row) throw new Error('Loan not found');
  return row;
}

export function listLoans(opts: {
  memberId?: number;
  filter?: 'active' | 'returned' | 'overdue' | 'all';
}): LoanDetail[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const filter = opts.filter ?? 'all';
  if (filter === 'active') where.push("l.status = 'active'");
  if (filter === 'returned') where.push("l.status = 'returned'");
  if (filter === 'overdue') where.push("l.status = 'active' AND l.due_date < date('now','localtime')");
  if (opts.memberId) {
    where.push('l.member_id = :memberId');
    params.memberId = opts.memberId;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`${loanDetailQuery} ${whereSql} ORDER BY l.checkout_date DESC, l.id DESC LIMIT 500`)
    .all(params) as LoanDetail[];
}

/** Local calendar date from SQLite — the single source of truth for due-date math. */
function localToday(): string {
  return (getDb().prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;
}

function findCopyByAccession(accessionNumber: string): Copy {
  const copy = getDb()
    .prepare('SELECT * FROM copies WHERE accession_number = ?')
    .get(accessionNumber.trim()) as Copy | undefined;
  if (!copy) throw new Error(`No copy found with accession number "${accessionNumber.trim()}"`);
  return copy;
}

export function checkout(accessionNumber: string, memberId: number): LoanDetail {
  const db = getDb();
  const settings = getSettings();
  const tx = db.transaction(() => {
    const copy = findCopyByAccession(accessionNumber);
    if (copy.status !== 'available') {
      throw new Error(`Copy ${copy.accession_number} is not available (status: ${copy.status.replace('_', ' ')})`);
    }
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as
      | Member
      | undefined;
    if (!member) throw new Error('Member not found');
    if (member.status !== 'active') {
      throw new Error(`Member ${member.name} is ${member.status} — cannot borrow`);
    }
    const activeCount = (
      db
        .prepare("SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND status = 'active'")
        .get(memberId) as { n: number }
    ).n;
    if (activeCount >= settings.max_books_per_member) {
      throw new Error(
        `${member.name} already has ${activeCount} book(s) out (limit ${settings.max_books_per_member})`,
      );
    }
    const info = db
      .prepare(
        `INSERT INTO loans (copy_id, member_id, due_date, checked_out_by)
         VALUES (?, ?, date('now','localtime', ?), ?)`,
      )
      .run(copy.id, memberId, `+${settings.loan_period_days} days`, getSession()?.id ?? null);
    db.prepare("UPDATE copies SET status = 'on_loan' WHERE id = ?").run(copy.id);
    return Number(info.lastInsertRowid);
  });
  const loanId = tx();
  const loan = getLoanDetail(loanId);
  logActivity(
    getSession()?.id ?? null,
    'checkout',
    `${loan.accession_number} "${loan.title}" → ${loan.member_name}, due ${loan.due_date}`,
  );
  return loan;
}

export function checkin(accessionNumber: string): { loan: LoanDetail; finePaise: number } {
  const db = getDb();
  const settings = getSettings();
  const tx = db.transaction(() => {
    const copy = findCopyByAccession(accessionNumber);
    const loan = db
      .prepare("SELECT * FROM loans WHERE copy_id = ? AND status = 'active'")
      .get(copy.id) as { id: number; member_id: number; due_date: string } | undefined;
    if (!loan) throw new Error(`Copy ${copy.accession_number} is not on loan`);
    db.prepare(
      "UPDATE loans SET status = 'returned', return_date = date('now','localtime') WHERE id = ?",
    ).run(loan.id);
    db.prepare("UPDATE copies SET status = 'available' WHERE id = ?").run(copy.id);
    const daysLate = Math.max(
      0,
      Math.round((Date.parse(localToday()) - Date.parse(loan.due_date)) / 86400000),
    );
    let finePaise = 0;
    if (daysLate > 0 && settings.fine_per_day_paise > 0) {
      finePaise = daysLate * settings.fine_per_day_paise;
      db.prepare(
        'INSERT INTO fines (loan_id, member_id, amount_paise, reason) VALUES (?, ?, ?, ?)',
      ).run(loan.id, loan.member_id, finePaise, `Returned ${daysLate} day(s) late`);
    }
    return { loanId: loan.id, finePaise };
  });
  const { loanId, finePaise } = tx();
  const loan = getLoanDetail(loanId);
  logActivity(
    getSession()?.id ?? null,
    'checkin',
    `${loan.accession_number} "${loan.title}" returned by ${loan.member_name}` +
      (finePaise > 0 ? ` (fine ${finePaise} paise)` : ''),
  );
  return { loan, finePaise };
}

export function renew(loanId: number): LoanDetail {
  const db = getDb();
  const settings = getSettings();
  const tx = db.transaction(() => {
    const loan = db.prepare("SELECT * FROM loans WHERE id = ? AND status = 'active'").get(loanId) as
      | { id: number; due_date: string; renewals_count: number }
      | undefined;
    if (!loan) throw new Error('Active loan not found');
    if (loan.renewals_count >= settings.max_renewals) {
      throw new Error(`Renewal limit reached (${settings.max_renewals})`);
    }
    if (loan.due_date < localToday()) {
      throw new Error('Loan is overdue — return it and settle the fine instead of renewing');
    }
    db.prepare(
      `UPDATE loans SET due_date = date(due_date, ?), renewals_count = renewals_count + 1 WHERE id = ?`,
    ).run(`+${settings.loan_period_days} days`, loanId);
  });
  tx();
  const loan = getLoanDetail(loanId);
  logActivity(
    getSession()?.id ?? null,
    'renew',
    `${loan.accession_number} "${loan.title}" renewed, now due ${loan.due_date}`,
  );
  return loan;
}

/** Reverse one renewal made by mistake: minus one count, due date rolled back a loan period. */
export function unrenew(loanId: number): LoanDetail {
  const db = getDb();
  const settings = getSettings();
  const tx = db.transaction(() => {
    const loan = db.prepare("SELECT * FROM loans WHERE id = ? AND status = 'active'").get(loanId) as
      | { id: number; renewals_count: number }
      | undefined;
    if (!loan) throw new Error('Active loan not found');
    if (loan.renewals_count <= 0) throw new Error('This loan has no renewals to undo');
    db.prepare(
      `UPDATE loans SET due_date = date(due_date, ?), renewals_count = renewals_count - 1 WHERE id = ?`,
    ).run(`-${settings.loan_period_days} days`, loanId);
  });
  tx();
  const loan = getLoanDetail(loanId);
  logActivity(
    getSession()?.id ?? null,
    'renew_undo',
    `${loan.accession_number} "${loan.title}" renewal undone, now due ${loan.due_date}`,
  );
  return loan;
}
