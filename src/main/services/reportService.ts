import { getDb } from '../db/connection';
import { listLoans, loanDetailQuery } from './circulationService';
import type {
  AccessionRegisterRow,
  CollectionSummaryRow,
  DashboardData,
  FinePaymentRow,
  LoanDetail,
  OverdueReportRow,
  PopularBookRow,
  WeekStats,
} from '../../shared/types';

function dateRange(
  column: string,
  fromDate?: string,
  toDate?: string,
): { where: string[]; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (fromDate) {
    where.push(`${column} >= :fromDate`);
    params.fromDate = fromDate;
  }
  if (toDate) {
    where.push(`${column} <= :toDate`);
    params.toDate = toDate;
  }
  return { where, params };
}

export function getDashboard(): DashboardData {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const totals = {
    titles: one('SELECT COUNT(*) AS n FROM books'),
    copies: one("SELECT COUNT(*) AS n FROM copies WHERE status NOT IN ('withdrawn','lost')"),
    members: one("SELECT COUNT(*) AS n FROM members WHERE status = 'active'"),
    activeLoans: one("SELECT COUNT(*) AS n FROM loans WHERE status = 'active'"),
    overdue: one(
      "SELECT COUNT(*) AS n FROM loans WHERE status = 'active' AND due_date < date('now','localtime')",
    ),
    outstandingFinesPaise: one(
      "SELECT COALESCE(SUM(amount_paise - amount_paid_paise), 0) AS n FROM fines WHERE status = 'outstanding'",
    ),
    accruingFinesPaise: one(
      `SELECT COALESCE(SUM(
         CAST(julianday(date('now','localtime')) - julianday(due_date) AS INTEGER)
         * (SELECT CAST(value AS INTEGER) FROM settings WHERE key='fine_per_day_paise')
       ), 0) AS n
       FROM loans WHERE status = 'active' AND due_date < date('now','localtime')`,
    ),
  };
  const overdueLoans = listLoans({ filter: 'overdue' });

  // Week-over-week trend. Dates come from SQLite so they agree with every other
  // date('now','localtime') in the app (JS Date would drift near midnight).
  const dayOffset = (n: number) =>
    (db.prepare("SELECT date('now','localtime', :m) AS d").get({ m: `${-n} days` }) as { d: string }).d;
  const dates = [6, 5, 4, 3, 2, 1, 0].map(dayOffset);
  const countByDay = (column: string) => {
    const rows = db
      .prepare(
        `SELECT ${column} AS d, COUNT(*) AS n FROM loans WHERE ${column} >= :from GROUP BY ${column}`,
      )
      .all({ from: dates[0] }) as { d: string; n: number }[];
    return new Map(rows.map((r) => [r.d, r.n]));
  };
  const issuedByDay = countByDay('checkout_date');
  const returnedByDay = countByDay('return_date');
  const weekly = {
    days: dates.map((date) => ({
      date,
      issued: issuedByDay.get(date) ?? 0,
      returned: returnedByDay.get(date) ?? 0,
    })),
    current: weekStats(dates[0], dates[6]),
    previous: weekStats(dayOffset(13), dayOffset(7)),
  };

  const dueSoon = db
    .prepare(
      `${loanDetailQuery}
       WHERE l.status = 'active'
         AND l.due_date >= date('now','localtime')
         AND l.due_date <= date('now','localtime','+3 days')
       ORDER BY l.due_date, l.id LIMIT 8`,
    )
    .all() as LoanDetail[];

  const categoryRows = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(b.category), ''), 'Uncategorised') AS category, COUNT(c.id) AS copies
       FROM copies c JOIN books b ON b.id = c.book_id
       WHERE c.status NOT IN ('withdrawn','lost')
       GROUP BY 1 ORDER BY copies DESC, category`,
    )
    .all() as DashboardData['categories'];
  const categories = categoryRows.slice(0, 5);
  const tail = categoryRows.slice(5).reduce((sum, r) => sum + r.copies, 0);
  if (tail > 0) categories.push({ category: 'Others', copies: tail });

  const popularBooks = db
    .prepare(
      `SELECT b.id AS book_id, b.title, b.authors, COUNT(*) AS loan_count
       FROM loans l JOIN copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
       WHERE l.checkout_date >= date('now','localtime','-90 days')
       GROUP BY b.id ORDER BY loan_count DESC, b.title LIMIT 10`,
    )
    .all() as DashboardData['popularBooks'];
  // Sign-ins are logged for the audit trail but drown the feed — show real work only.
  const recentActivity = db
    .prepare(
      `SELECT a.id, a.at, a.action, a.detail, u.username
       FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action NOT IN ('login', 'logout')
       ORDER BY a.id DESC LIMIT 12`,
    )
    .all() as DashboardData['recentActivity'];
  return { totals, weekly, dueSoon, categories, overdueLoans, popularBooks, recentActivity };
}

/** Circulation counts for an inclusive YYYY-MM-DD date range. */
function weekStats(from: string, to: string): WeekStats {
  const db = getDb();
  const p = { from, to };
  const one = (sql: string) => (db.prepare(sql).get(p) as { n: number }).n;
  return {
    issued: one('SELECT COUNT(*) AS n FROM loans WHERE checkout_date BETWEEN :from AND :to'),
    returned: one('SELECT COUNT(*) AS n FROM loans WHERE return_date BETWEEN :from AND :to'),
    newMembers: one('SELECT COUNT(*) AS n FROM members WHERE join_date BETWEEN :from AND :to'),
    finesCollectedPaise: one(
      'SELECT COALESCE(SUM(amount_paise), 0) AS n FROM fine_payments WHERE date(paid_at) BETWEEN :from AND :to',
    ),
  };
}

/** All loans whose checkout date falls in the range, any status. */
export function getCirculationReport(opts: {
  fromDate?: string;
  toDate?: string;
  status?: 'active' | 'returned' | 'overdue';
}): LoanDetail[] {
  const { where, params } = dateRange('l.checkout_date', opts.fromDate, opts.toDate);
  if (opts.status === 'active') where.push("l.status = 'active'");
  if (opts.status === 'returned') where.push("l.status = 'returned'");
  if (opts.status === 'overdue')
    where.push("l.status = 'active' AND l.due_date < date('now','localtime')");
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`${loanDetailQuery} ${whereSql} ORDER BY l.checkout_date DESC, l.id DESC LIMIT 2000`)
    .all(params) as LoanDetail[];
}

/** Overdue loans with member contact details, worst first. */
export function getOverdueReport(): OverdueReportRow[] {
  return getDb()
    .prepare(
      `${loanDetailQuery.replace('m.name AS member_name, m.member_code,', 'm.name AS member_name, m.member_code, m.email, m.phone,')}
       WHERE l.status = 'active' AND l.due_date < date('now','localtime')
       ORDER BY l.due_date ASC`,
    )
    .all() as OverdueReportRow[];
}

/** Fine payments received in the range — for cash reconciliation. */
export function getFineCollections(opts: {
  fromDate?: string;
  toDate?: string;
}): { rows: FinePaymentRow[]; totalPaise: number } {
  const { where, params } = dateRange('date(p.paid_at)', opts.fromDate, opts.toDate);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.paid_at, p.amount_paise, p.note,
              m.name AS member_name, m.member_code,
              b.title, u.username AS recorded_by_username
       FROM fine_payments p
       JOIN fines f ON f.id = p.fine_id
       JOIN members m ON m.id = f.member_id
       LEFT JOIN loans l ON l.id = f.loan_id
       LEFT JOIN copies c ON c.id = l.copy_id
       LEFT JOIN books b ON b.id = c.book_id
       LEFT JOIN users u ON u.id = p.recorded_by
       ${whereSql}
       ORDER BY p.paid_at DESC LIMIT 2000`,
    )
    .all(params) as FinePaymentRow[];
  const totalPaise = rows.reduce((sum, r) => sum + r.amount_paise, 0);
  return { rows, totalPaise };
}

/** Collection stock + value grouped by category, with per-status copy counts. */
export function getCollectionSummary(): { rows: CollectionSummaryRow[]; totals: CollectionSummaryRow } {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(b.category), ''), 'Uncategorised') AS category,
              COUNT(DISTINCT b.id) AS titles,
              COUNT(c.id) AS copies,
              COALESCE(SUM(c.cost_paise), 0) AS total_cost_paise,
              SUM(c.status = 'available') AS available,
              SUM(c.status = 'on_loan') AS on_loan,
              SUM(c.status = 'lost') AS lost,
              SUM(c.status = 'damaged') AS damaged,
              SUM(c.status = 'withdrawn') AS withdrawn
       FROM books b LEFT JOIN copies c ON c.book_id = b.id
       GROUP BY 1 ORDER BY copies DESC, category`,
    )
    .all() as CollectionSummaryRow[];
  const totals = rows.reduce(
    (t, r) => ({
      category: 'Total',
      titles: t.titles + r.titles,
      copies: t.copies + r.copies,
      total_cost_paise: t.total_cost_paise + r.total_cost_paise,
      available: t.available + r.available,
      on_loan: t.on_loan + r.on_loan,
      lost: t.lost + r.lost,
      damaged: t.damaged + r.damaged,
      withdrawn: t.withdrawn + r.withdrawn,
    }),
    { category: 'Total', titles: 0, copies: 0, total_cost_paise: 0, available: 0, on_loan: 0, lost: 0, damaged: 0, withdrawn: 0 },
  );
  return { rows, totals };
}

/** Most borrowed titles in the range. */
export function getPopularBooks(opts: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): PopularBookRow[] {
  const { where, params } = dateRange('l.checkout_date', opts.fromDate, opts.toDate);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT b.id AS book_id, b.title, b.authors, b.category,
              COUNT(*) AS loan_count,
              COUNT(DISTINCT l.member_id) AS unique_borrowers,
              MAX(l.checkout_date) AS last_borrowed
       FROM loans l JOIN copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
       ${whereSql}
       GROUP BY b.id ORDER BY loan_count DESC, b.title LIMIT :limit`,
    )
    .all({ ...params, limit: Math.min(200, opts.limit ?? 50) }) as PopularBookRow[];
}

export function getAccessionRegister(opts: {
  fromDate?: string;
  toDate?: string;
}): AccessionRegisterRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.fromDate) {
    where.push('c.accession_date >= :fromDate');
    params.fromDate = opts.fromDate;
  }
  if (opts.toDate) {
    where.push('c.accession_date <= :toDate');
    params.toDate = opts.toDate;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(
      `SELECT c.accession_date, c.accession_number, b.authors, b.title,
              b.publisher, b.place, b.volume, b.edition, b.year,
              c.binding, b.pages, c.bill_no, c.source, c.cost_paise,
              b.subject, c.remarks, c.status
       FROM copies c JOIN books b ON b.id = c.book_id
       ${whereSql}
       ORDER BY c.accession_number`,
    )
    .all(params) as AccessionRegisterRow[];
}
