import fs from 'node:fs';
import path from 'node:path';
import { getCoversDir, getDb } from '../db/connection';
import { nextAccessionNumber } from './settingsService';
import { logActivity } from './activityService';
import { getSession } from './authService';
import type {
  Book,
  BookDetail,
  BookInput,
  BookListRow,
  BookSort,
  BookStatusFilter,
  CatalogStats,
  Copy,
  CopyInput,
  CopyStatus,
  CopyWithBorrower,
  Paged,
} from '../../shared/types';
import { loanDetailQuery } from './circulationService';

function saveCoverFromDataUrl(bookId: number, dataUrl: string): string {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('Invalid cover image data');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = path.join(getCoversDir(), `${bookId}.${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
  return file;
}

export function readCoverDataUrl(bookId: number): string | null {
  const row = getDb().prepare('SELECT cover_path FROM books WHERE id = ?').get(bookId) as
    | { cover_path: string | null }
    | undefined;
  if (!row?.cover_path || !fs.existsSync(row.cover_path)) return null;
  const ext = path.extname(row.cover_path).slice(1).replace('jpg', 'jpeg');
  const buf = fs.readFileSync(row.cover_path);
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

const BOOK_COLUMNS =
  'title, authors, isbn, publisher, place, year, edition, volume, pages, subject, category, description, resource_type';

/** Whitelisted ORDER BY expressions — `sort` from the renderer never reaches SQL directly. */
const BOOK_SORTS: Record<BookSort, string> = {
  title: 'b.title COLLATE NOCASE',
  authors: 'b.authors COLLATE NOCASE',
  year: 'b.year',
  category: 'b.category COLLATE NOCASE',
  copies: 'total_copies',
  available: 'available_copies',
};

/** Title-level copy-status facets: a title matches when any copy is in that state. */
const BOOK_STATUS_WHERE: Record<BookStatusFilter, string> = {
  available: "EXISTS (SELECT 1 FROM copies c3 WHERE c3.book_id = b.id AND c3.status = 'available')",
  issued: "EXISTS (SELECT 1 FROM copies c3 WHERE c3.book_id = b.id AND c3.status = 'on_loan')",
  lost_damaged: "EXISTS (SELECT 1 FROM copies c3 WHERE c3.book_id = b.id AND c3.status IN ('lost','damaged'))",
  withdrawn: "EXISTS (SELECT 1 FROM copies c3 WHERE c3.book_id = b.id AND c3.status = 'withdrawn')",
};

export function listBooks(opts: {
  search?: string;
  category?: string;
  resourceType?: string;
  status?: BookStatusFilter;
  location?: string;
  sort?: BookSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}): Paged<BookListRow> {
  const db = getDb();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, opts.pageSize ?? 25);
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.status && BOOK_STATUS_WHERE[opts.status]) where.push(BOOK_STATUS_WHERE[opts.status]);
  if (opts.location?.trim()) {
    where.push('EXISTS (SELECT 1 FROM copies c4 WHERE c4.book_id = b.id AND c4.shelf_location = :location)');
    params.location = opts.location.trim();
  }
  const orderBy = `${BOOK_SORTS[opts.sort ?? 'title']} ${opts.dir === 'desc' ? 'DESC' : 'ASC'}, b.title COLLATE NOCASE`;
  if (opts.search?.trim()) {
    where.push(
      "(b.title LIKE :q OR b.authors LIKE :q OR b.isbn LIKE :q OR b.subject LIKE :q OR EXISTS (SELECT 1 FROM copies c2 WHERE c2.book_id = b.id AND c2.accession_number LIKE :q))",
    );
    params.q = `%${opts.search.trim()}%`;
  }
  if (opts.category?.trim()) {
    where.push('b.category = :category');
    params.category = opts.category.trim();
  }
  if (opts.resourceType?.trim()) {
    where.push('b.resource_type = :resourceType');
    params.resourceType = opts.resourceType.trim();
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db.prepare(`SELECT COUNT(*) AS n FROM books b ${whereSql}`).get(params) as { n: number }
  ).n;
  const rows = db
    .prepare(
      `SELECT b.*,
        (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status NOT IN ('withdrawn','lost')) AS total_copies,
        (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available') AS available_copies,
        (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'on_loan') AS on_loan_copies,
        (SELECT GROUP_CONCAT(DISTINCT c.shelf_location) FROM copies c
          WHERE c.book_id = b.id AND c.shelf_location IS NOT NULL AND TRIM(c.shelf_location) <> '') AS shelf_locations
       FROM books b ${whereSql}
       ORDER BY ${orderBy}
       LIMIT :limit OFFSET :offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize }) as BookListRow[];
  return { rows, total };
}

/** Collection-wide figures for the catalog page: tiles, quick-filter counts, top categories, locations. */
export function getCatalogStats(): CatalogStats {
  const db = getDb();
  const one = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    titles: one('SELECT COUNT(*) AS n FROM books'),
    copies: one("SELECT COUNT(*) AS n FROM copies WHERE status NOT IN ('withdrawn','lost')"),
    available: one("SELECT COUNT(*) AS n FROM copies WHERE status = 'available'"),
    onLoan: one("SELECT COUNT(*) AS n FROM copies WHERE status = 'on_loan'"),
    lostDamaged: one("SELECT COUNT(*) AS n FROM copies WHERE status IN ('lost','damaged')"),
    withdrawn: one("SELECT COUNT(*) AS n FROM copies WHERE status = 'withdrawn'"),
    categories: one("SELECT COUNT(DISTINCT NULLIF(TRIM(category), '')) AS n FROM books"),
    publishers: one("SELECT COUNT(DISTINCT NULLIF(TRIM(publisher), '')) AS n FROM books"),
    topCategories: db
      .prepare(
        `SELECT COALESCE(NULLIF(TRIM(b.category), ''), 'Uncategorised') AS category, COUNT(c.id) AS copies
         FROM copies c JOIN books b ON b.id = c.book_id
         WHERE c.status NOT IN ('withdrawn','lost')
         GROUP BY 1 ORDER BY copies DESC, category LIMIT 5`,
      )
      .all() as CatalogStats['topCategories'],
    locations: (
      db
        .prepare(
          `SELECT DISTINCT shelf_location AS l FROM copies
           WHERE shelf_location IS NOT NULL AND TRIM(shelf_location) <> ''
           ORDER BY shelf_location COLLATE NOCASE`,
        )
        .all() as { l: string }[]
    ).map((r) => r.l),
  };
}

export function getBookDetail(id: number): BookDetail {
  const db = getDb();
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as Book | undefined;
  if (!book) throw new Error('Book not found');
  const copies = db
    .prepare(
      `SELECT c.*, m.name AS borrower_name, m.member_code AS borrower_member_code, l.due_date AS loan_due_date
       FROM copies c
       LEFT JOIN loans l ON l.copy_id = c.id AND l.status = 'active'
       LEFT JOIN members m ON m.id = l.member_id
       WHERE c.book_id = ?
       ORDER BY c.accession_number`,
    )
    .all(id) as CopyWithBorrower[];
  const loanHistory = db
    .prepare(`${loanDetailQuery} WHERE c.book_id = ? ORDER BY l.checkout_date DESC LIMIT 50`)
    .all(id) as BookDetail['loanHistory'];
  return { book, copies, loanHistory };
}

function bookParams(book: BookInput) {
  return {
    title: book.title.trim(),
    authors: book.authors.trim(),
    isbn: book.isbn || null,
    publisher: book.publisher || null,
    place: book.place || null,
    year: book.year || null,
    edition: book.edition || null,
    volume: book.volume || null,
    pages: book.pages || null,
    subject: book.subject || null,
    category: book.category || null,
    description: book.description || null,
    resource_type: book.resource_type || 'book',
  };
}

export function createBook(book: BookInput, copies: CopyInput[]): { id: number } {
  const db = getDb();
  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO books (${BOOK_COLUMNS})
         VALUES (:title, :authors, :isbn, :publisher, :place, :year, :edition, :volume, :pages, :subject, :category, :description, :resource_type)`,
      )
      .run(bookParams(book));
    const bookId = Number(info.lastInsertRowid);
    for (const copy of copies) insertCopy(bookId, copy);
    if (book.coverDataUrl) {
      const file = saveCoverFromDataUrl(bookId, book.coverDataUrl);
      db.prepare('UPDATE books SET cover_path = ? WHERE id = ?').run(file, bookId);
    }
    return bookId;
  });
  const id = tx();
  logActivity(getSession()?.id ?? null, 'book_add', `Added "${book.title}" with ${copies.length} cop${copies.length === 1 ? 'y' : 'ies'}`);
  return { id };
}

export function updateBook(id: number, book: BookInput): void {
  const db = getDb();
  db.prepare(
    `UPDATE books SET title=:title, authors=:authors, isbn=:isbn, publisher=:publisher, place=:place,
       year=:year, edition=:edition, volume=:volume, pages=:pages, subject=:subject,
       category=:category, description=:description, resource_type=:resource_type,
       updated_at=datetime('now','localtime')
     WHERE id=:id`,
  ).run({ ...bookParams(book), id });
  if (book.coverDataUrl) {
    const file = saveCoverFromDataUrl(id, book.coverDataUrl);
    db.prepare('UPDATE books SET cover_path = ? WHERE id = ?').run(file, id);
  }
  logActivity(getSession()?.id ?? null, 'book_edit', `Edited "${book.title}"`);
}

export function deleteBook(id: number): void {
  const db = getDb();
  const active = db
    .prepare(
      "SELECT COUNT(*) AS n FROM loans l JOIN copies c ON c.id = l.copy_id WHERE c.book_id = ? AND l.status = 'active'",
    )
    .get(id) as { n: number };
  if (active.n > 0) throw new Error('Cannot delete: this title has copies currently on loan');
  const book = db.prepare('SELECT title, cover_path FROM books WHERE id = ?').get(id) as
    | { title: string; cover_path: string | null }
    | undefined;
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
  if (book?.cover_path && fs.existsSync(book.cover_path)) fs.unlinkSync(book.cover_path);
  logActivity(getSession()?.id ?? null, 'book_delete', `Deleted "${book?.title ?? id}"`);
}

export function listCategories(): string[] {
  return (
    getDb()
      .prepare(
        "SELECT DISTINCT category FROM books WHERE category IS NOT NULL AND category != '' ORDER BY category",
      )
      .all() as { category: string }[]
  ).map((r) => r.category);
}

/** Insert a copy; allocates the next accession number when none given. Call within a transaction for batches. */
function insertCopy(bookId: number, copy: CopyInput): Copy {
  const db = getDb();
  const accession = copy.accession_number?.trim() || nextAccessionNumber();
  const info = db
    .prepare(
      `INSERT INTO copies (book_id, accession_number, accession_date, binding, source, bill_no, cost_paise, remarks, shelf_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      bookId,
      accession,
      copy.accession_date ||
        (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d,
      copy.binding || null,
      copy.source || null,
      copy.bill_no || null,
      copy.cost_paise ?? null,
      copy.remarks || null,
      copy.shelf_location || null,
    );
  return db.prepare('SELECT * FROM copies WHERE id = ?').get(Number(info.lastInsertRowid)) as Copy;
}

export function addCopy(bookId: number, copy: CopyInput): Copy {
  const db = getDb();
  const tx = db.transaction(() => insertCopy(bookId, copy));
  const created = tx();
  logActivity(getSession()?.id ?? null, 'copy_add', `Accessioned ${created.accession_number}`);
  return created;
}

export function updateCopy(id: number, patch: Partial<CopyInput> & { status?: CopyStatus }): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM copies WHERE id = ?').get(id) as Copy | undefined;
  if (!existing) throw new Error('Copy not found');
  if (patch.status && existing.status === 'on_loan' && patch.status !== 'on_loan') {
    throw new Error('Copy is on loan — return it first');
  }
  db.prepare(
    `UPDATE copies SET
       accession_number = ?, accession_date = ?, binding = ?, source = ?, bill_no = ?,
       cost_paise = ?, remarks = ?, shelf_location = ?, status = ?
     WHERE id = ?`,
  ).run(
    patch.accession_number?.trim() || existing.accession_number,
    patch.accession_date ?? existing.accession_date,
    patch.binding !== undefined ? patch.binding : existing.binding,
    patch.source !== undefined ? patch.source : existing.source,
    patch.bill_no !== undefined ? patch.bill_no : existing.bill_no,
    patch.cost_paise !== undefined ? patch.cost_paise : existing.cost_paise,
    patch.remarks !== undefined ? patch.remarks : existing.remarks,
    patch.shelf_location !== undefined ? patch.shelf_location : existing.shelf_location,
    patch.status ?? existing.status,
    id,
  );
}

export function removeCopy(id: number): void {
  const db = getDb();
  const copy = db.prepare('SELECT * FROM copies WHERE id = ?').get(id) as Copy | undefined;
  if (!copy) return;
  if (copy.status === 'on_loan') throw new Error('Copy is on loan — return it first');
  const hasLoans = (
    db.prepare('SELECT COUNT(*) AS n FROM loans WHERE copy_id = ?').get(id) as { n: number }
  ).n;
  if (hasLoans > 0) {
    // Preserve loan history: mark withdrawn instead of deleting.
    db.prepare("UPDATE copies SET status = 'withdrawn' WHERE id = ?").run(id);
  } else {
    db.prepare('DELETE FROM copies WHERE id = ?').run(id);
  }
  logActivity(getSession()?.id ?? null, 'copy_remove', `Removed copy ${copy.accession_number}`);
}
