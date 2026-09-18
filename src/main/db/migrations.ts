import type { Database } from 'better-sqlite3';

const MIGRATIONS: string[] = [
  // 001 — initial schema
  `
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE members (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    join_date   TEXT NOT NULL DEFAULT (date('now','localtime')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','expired')),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT NOT NULL UNIQUE,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL CHECK (role IN ('librarian','member')),
    member_id            INTEGER REFERENCES members(id) ON DELETE CASCADE,
    is_active            INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    authors     TEXT NOT NULL DEFAULT '',
    isbn        TEXT,
    publisher   TEXT,
    place       TEXT,
    year        INTEGER,
    edition     TEXT,
    volume      TEXT,
    pages       TEXT,
    subject     TEXT,
    category    TEXT,
    description TEXT,
    cover_path  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_books_title ON books(title);
  CREATE INDEX idx_books_isbn ON books(isbn);
  CREATE INDEX idx_books_category ON books(category);

  CREATE TABLE copies (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id          INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    accession_number TEXT NOT NULL UNIQUE,
    accession_date   TEXT NOT NULL DEFAULT (date('now','localtime')),
    binding          TEXT,
    source           TEXT,
    bill_no          TEXT,
    cost_paise       INTEGER,
    remarks          TEXT,
    shelf_location   TEXT,
    status           TEXT NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available','on_loan','lost','damaged','withdrawn')),
    last_verified_at TEXT
  );
  CREATE INDEX idx_copies_book ON copies(book_id);

  CREATE TABLE loans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    copy_id        INTEGER NOT NULL REFERENCES copies(id),
    member_id      INTEGER NOT NULL REFERENCES members(id),
    checkout_date  TEXT NOT NULL DEFAULT (date('now','localtime')),
    due_date       TEXT NOT NULL,
    return_date    TEXT,
    renewals_count INTEGER NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned')),
    checked_out_by INTEGER REFERENCES users(id)
  );
  CREATE UNIQUE INDEX idx_one_active_loan_per_copy ON loans(copy_id) WHERE status = 'active';
  CREATE INDEX idx_loans_member ON loans(member_id);

  CREATE TABLE fines (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id           INTEGER REFERENCES loans(id),
    member_id         INTEGER NOT NULL REFERENCES members(id),
    amount_paise      INTEGER NOT NULL,
    amount_paid_paise INTEGER NOT NULL DEFAULT 0,
    reason            TEXT,
    status            TEXT NOT NULL DEFAULT 'outstanding'
                      CHECK (status IN ('outstanding','paid','waived')),
    created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE INDEX idx_fines_member ON fines(member_id);

  CREATE TABLE fine_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fine_id     INTEGER NOT NULL REFERENCES fines(id),
    amount_paise INTEGER NOT NULL,
    paid_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    recorded_by INTEGER REFERENCES users(id),
    note        TEXT
  );

  CREATE TABLE activity_log (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    user_id INTEGER,
    action  TEXT NOT NULL,
    detail  TEXT
  );
  `,
  // 002 — member photos
  `
  ALTER TABLE members ADD COLUMN photo_path TEXT;
  `,
  // 003 — resource types (book / magazine / cd / dvd / reference)
  `
  ALTER TABLE books ADD COLUMN resource_type TEXT NOT NULL DEFAULT 'book';
  `,
  // 004 — school members: student vs staff, class/section/roll, guardian contact
  `
  ALTER TABLE members ADD COLUMN member_type TEXT NOT NULL DEFAULT 'student' CHECK (member_type IN ('student','staff'));
  ALTER TABLE members ADD COLUMN class_name TEXT;
  ALTER TABLE members ADD COLUMN section TEXT;
  ALTER TABLE members ADD COLUMN roll_no TEXT;
  ALTER TABLE members ADD COLUMN guardian_name TEXT;
  ALTER TABLE members ADD COLUMN guardian_phone TEXT;
  CREATE INDEX IF NOT EXISTS idx_members_class ON members(class_name, section);
  `,
];

const DEFAULT_SETTINGS: Record<string, string> = {
  library_name: 'My Library',
  currency_symbol: '₹',
  loan_period_days: '14',
  max_books_per_member: '3',
  fine_per_day_paise: '100',
  max_renewals: '2',
  accession_prefix: 'ACC',
  accession_next_seq: '1',
  backup_dir: '',
  backup_auto_last: '',
};

export function runMigrations(db: Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
    })();
  }
  // Seed defaults for any missing settings keys (idempotent).
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
}
