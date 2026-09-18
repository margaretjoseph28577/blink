import bcrypt from 'bcryptjs';
import { getDb } from '../db/connection';
import { createBook } from './bookService';
import { nextMemberCode } from './memberService';
import { getSettings } from './settingsService';
import { logActivity } from './activityService';
import { getSession } from './authService';
import type { BookInput, CopyInput, ImportResult, ImportRowError } from '../../shared/types';

/** RFC-4180-ish CSV parser: quoted fields, embedded commas/quotes/newlines, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ''); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Canonical column names the importer understands, with common aliases. */
const HEADER_ALIASES: Record<string, string> = {
  title: 'title',
  author: 'authors',
  authors: 'authors',
  isbn: 'isbn',
  publisher: 'publisher',
  place: 'place',
  year: 'year',
  edition: 'edition',
  volume: 'volume',
  pages: 'pages',
  subject: 'subject',
  category: 'category',
  description: 'description',
  type: 'resource_type',
  'resource type': 'resource_type',
  resource_type: 'resource_type',
  'accession number': 'accession_number',
  'accession no': 'accession_number',
  accession_number: 'accession_number',
  accession_no: 'accession_number',
  'accession date': 'accession_date',
  accession_date: 'accession_date',
  binding: 'binding',
  source: 'source',
  'bill no': 'bill_no',
  bill_no: 'bill_no',
  cost: 'cost',
  price: 'cost',
  'shelf location': 'shelf_location',
  shelf_location: 'shelf_location',
  remarks: 'remarks',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ERRORS = 50;

interface ParsedRow {
  line: number;
  get: (col: string) => string;
}

/**
 * Import a catalog CSV. One row per copy; rows sharing an ISBN (or, without an
 * ISBN, the same title + authors) become one title with multiple copies.
 * dryRun validates and counts without writing anything.
 */
export function importBooksCsv(csvText: string, dryRun: boolean): ImportResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'File needs a header row and at least one data row' }] };
  }

  const headers = rows[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!headers.includes('title')) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'Header row must include a "title" column' }] };
  }

  const errors: ImportRowError[] = [];
  const addError = (line: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, message });
  };

  // Validate rows and group into titles.
  const db = getDb();
  const accessionExists = db.prepare('SELECT 1 AS x FROM copies WHERE accession_number = ?');
  const seenAccessions = new Set<string>();
  const groups = new Map<string, ParsedRow[]>();

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i];
    const get = (col: string) => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const title = get('title');
    if (!title) {
      addError(line, 'Missing title — row skipped');
      continue;
    }
    const year = get('year');
    if (year && !/^\d{4}$/.test(year)) addError(line, `Invalid year "${year}" — must be a 4-digit year or blank`);
    const cost = get('cost');
    if (cost && Number.isNaN(Number(cost))) addError(line, `Invalid cost "${cost}" — must be a number or blank`);
    const accDate = get('accession_date');
    if (accDate && !DATE_RE.test(accDate)) addError(line, `Invalid accession_date "${accDate}" — use YYYY-MM-DD or leave blank`);
    const rtype = get('resource_type').toLowerCase();
    if (rtype && !['book', 'magazine', 'cd', 'dvd', 'reference'].includes(rtype)) {
      addError(line, `Invalid resource_type "${get('resource_type')}" — use book, magazine, cd, dvd or reference (or leave blank)`);
    }
    const acc = get('accession_number');
    if (acc) {
      if (seenAccessions.has(acc)) addError(line, `Duplicate accession number "${acc}" in this file`);
      else if (accessionExists.get(acc)) addError(line, `Accession number "${acc}" already exists in the catalog`);
      seenAccessions.add(acc);
    }
    const isbn = get('isbn');
    const key = isbn ? `isbn:${isbn}` : `t:${title.toLowerCase()}|${get('authors').toLowerCase()}`;
    const group = groups.get(key);
    if (group) group.push({ line, get });
    else groups.set(key, [{ line, get }]);
  }

  if (errors.length > 0 || dryRun) {
    // Never write when any row is invalid — fix the file and re-run.
    const copies = [...groups.values()].reduce((s, g) => s + g.length, 0);
    return { dryRun: true, primary: groups.size, secondary: copies, errors };
  }

  let books = 0;
  let copies = 0;
  for (const group of groups.values()) {
    const first = group[0].get;
    const book: BookInput = {
      title: first('title'),
      authors: first('authors'),
      isbn: first('isbn') || null,
      publisher: first('publisher') || null,
      place: first('place') || null,
      year: first('year') ? Number(first('year')) : null,
      edition: first('edition') || null,
      volume: first('volume') || null,
      pages: first('pages') || null,
      subject: first('subject') || null,
      category: first('category') || null,
      description: first('description') || null,
      resource_type: (first('resource_type').toLowerCase() || 'book') as BookInput['resource_type'],
    };
    const copyInputs: CopyInput[] = group.map(({ get }) => ({
      accession_number: get('accession_number') || null,
      accession_date:
        get('accession_date') ||
        (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d,
      binding: get('binding') || null,
      source: get('source') || null,
      bill_no: get('bill_no') || null,
      cost_paise: get('cost') ? Math.round(Number(get('cost')) * 100) : null,
      remarks: get('remarks') || null,
      shelf_location: get('shelf_location') || null,
    }));
    try {
      createBook(book, copyInputs);
      books++;
      copies += copyInputs.length;
    } catch (err) {
      addError(group[0].line, `"${book.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logActivity(
    getSession()?.id ?? null,
    'import',
    `CSV import: ${books} title(s), ${copies} cop(ies)${errors.length ? `, ${errors.length} error(s)` : ''}`,
  );
  return { dryRun: false, primary: books, secondary: copies, errors };
}

const MEMBER_HEADER_ALIASES: Record<string, string> = {
  name: 'name',
  'member code': 'member_code',
  member_code: 'member_code',
  code: 'member_code',
  'member id': 'member_code',
  email: 'email',
  phone: 'phone',
  mobile: 'phone',
  'join date': 'join_date',
  join_date: 'join_date',
  joined: 'join_date',
  status: 'status',
  notes: 'notes',
  username: 'username',
  login: 'username',
  password: 'password',
  member_type: 'member_type',
  type: 'member_type',
  class: 'class_name',
  class_name: 'class_name',
  standard: 'class_name',
  grade: 'class_name',
  section: 'section',
  division: 'section',
  roll_no: 'roll_no',
  roll: 'roll_no',
  roll_number: 'roll_no',
  guardian_name: 'guardian_name',
  parent_name: 'guardian_name',
  guardian_phone: 'guardian_phone',
  parent_phone: 'guardian_phone',
};

const MEMBER_STATUSES = new Set(['active', 'suspended', 'expired']);
const MEMBER_TYPES = new Set(['student', 'staff']);

/**
 * Import a members CSV. One row per member; a row with username + password
 * also creates an OPAC login (forced to change password at first sign-in).
 * Blank member_code → auto-assigned. All-or-nothing: any invalid row blocks the import.
 */
export function importMembersCsv(csvText: string, dryRun: boolean): ImportResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'File needs a header row and at least one data row' }] };
  }
  const headers = rows[0].map((h) => MEMBER_HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!headers.includes('name')) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'Header row must include a "name" column' }] };
  }

  const errors: ImportRowError[] = [];
  const addError = (line: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, message });
  };

  const db = getDb();
  const codeExists = db.prepare('SELECT 1 AS x FROM members WHERE member_code = ?');
  const usernameExists = db.prepare('SELECT 1 AS x FROM users WHERE username = ?');
  const seenCodes = new Set<string>();
  const seenUsernames = new Set<string>();
  const parsed: ParsedRow[] = [];
  let logins = 0;

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i];
    const get = (col: string) => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    if (!get('name')) {
      addError(line, 'Missing name');
      continue;
    }
    const joinDate = get('join_date');
    if (joinDate && !DATE_RE.test(joinDate)) addError(line, `Invalid join_date "${joinDate}" — use YYYY-MM-DD or leave blank`);
    const status = get('status').toLowerCase();
    if (status && !MEMBER_STATUSES.has(status)) addError(line, `Invalid status "${get('status')}" — use active, suspended or expired`);
    const mtype = get('member_type').toLowerCase();
    if (mtype && !MEMBER_TYPES.has(mtype)) addError(line, `Invalid member_type "${get('member_type')}" — use student or staff`);
    const code = get('member_code');
    if (code) {
      if (seenCodes.has(code)) addError(line, `Duplicate member code "${code}" in this file`);
      else if (codeExists.get(code)) addError(line, `Member code "${code}" already exists`);
      seenCodes.add(code);
    }
    const username = get('username').toLowerCase();
    const password = get('password');
    if (username || password) {
      if (!username || !password) addError(line, 'To create a login, both username and password are needed');
      else if (username.length < 2) addError(line, `Username "${username}" is too short (min 2 characters)`);
      else if (password.length < 4) addError(line, 'Password too short (min 4 characters)');
      else if (seenUsernames.has(username)) addError(line, `Duplicate username "${username}" in this file`);
      else if (usernameExists.get(username)) addError(line, `Username "${username}" is already taken`);
      if (username) seenUsernames.add(username);
      logins++;
    }
    parsed.push({ line, get });
  }

  if (errors.length > 0 || dryRun) {
    return { dryRun: true, primary: parsed.length, secondary: logins, errors };
  }

  const tx = db.transaction(() => {
    for (const { get } of parsed) {
      const code = get('member_code') || nextMemberCode();
      const isStaff = get('member_type').toLowerCase() === 'staff';
      const studentOnly = (col: string) => (isStaff ? null : get(col) || null);
      const info = db
        .prepare(
          `INSERT INTO members (member_code, name, email, phone, join_date, status, notes,
                                member_type, class_name, section, roll_no, guardian_name, guardian_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          code,
          get('name'),
          get('email') || null,
          get('phone') || null,
          get('join_date') ||
            (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d,
          get('status').toLowerCase() || 'active',
          get('notes') || null,
          isStaff ? 'staff' : 'student',
          studentOnly('class_name'),
          studentOnly('section')?.toUpperCase() ?? null,
          studentOnly('roll_no'),
          studentOnly('guardian_name'),
          studentOnly('guardian_phone'),
        );
      if (get('username')) {
        db.prepare(
          "INSERT INTO users (username, password_hash, role, member_id, must_change_password) VALUES (?, ?, 'member', ?, 1)",
        ).run(get('username').toLowerCase(), bcrypt.hashSync(get('password'), 10), Number(info.lastInsertRowid));
      }
    }
  });
  tx();

  logActivity(
    getSession()?.id ?? null,
    'import',
    `CSV import: ${parsed.length} member(s), ${logins} login(s)`,
  );
  return { dryRun: false, primary: parsed.length, secondary: logins, errors };
}

const LOAN_HEADER_ALIASES: Record<string, string> = {
  'accession number': 'accession_number',
  'accession no': 'accession_number',
  accession_number: 'accession_number',
  accession_no: 'accession_number',
  'member code': 'member_code',
  member_code: 'member_code',
  'member id': 'member_code',
  member: 'member_code',
  'checkout date': 'checkout_date',
  checkout_date: 'checkout_date',
  'issue date': 'checkout_date',
  issued: 'checkout_date',
  'due date': 'due_date',
  due_date: 'due_date',
  due: 'due_date',
};

/**
 * Import active loans (bulk issue) — for migrating from another system.
 * Each row issues one available copy to an existing member. Bypasses the
 * per-member book limit on purpose: migrated data reflects reality.
 * All-or-nothing: any invalid row blocks the whole import.
 */
export function importLoansCsv(csvText: string, dryRun: boolean): ImportResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'File needs a header row and at least one data row' }] };
  }
  const headers = rows[0].map((h) => LOAN_HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
  if (!headers.includes('accession_number') || !headers.includes('member_code')) {
    return { dryRun, primary: 0, secondary: 0, errors: [{ line: 1, message: 'Header row must include "accession_number" and "member_code" columns' }] };
  }

  const errors: ImportRowError[] = [];
  const addError = (line: number, message: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ line, message });
  };

  const db = getDb();
  const settings = getSettings();
  const findCopy = db.prepare('SELECT id, status FROM copies WHERE accession_number = ?');
  const findMember = db.prepare('SELECT id, name FROM members WHERE member_code = ?');
  const seenAccessions = new Set<string>();
  const loans: { line: number; copyId: number; memberId: number; checkoutDate: string; dueDate: string }[] = [];
  const todayStr = (db.prepare("SELECT date('now','localtime') AS d").get() as { d: string }).d;

  for (let i = 1; i < rows.length; i++) {
    const line = i + 1;
    const cells = rows[i];
    const get = (col: string) => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };
    const acc = get('accession_number');
    const code = get('member_code');
    if (!acc || !code) {
      addError(line, 'Both accession_number and member_code are needed');
      continue;
    }
    if (seenAccessions.has(acc)) {
      addError(line, `Accession number "${acc}" appears twice — a copy can only be with one member`);
      continue;
    }
    seenAccessions.add(acc);
    const copy = findCopy.get(acc) as { id: number; status: string } | undefined;
    if (!copy) {
      addError(line, `No copy with accession number "${acc}" — import the catalog first`);
      continue;
    }
    if (copy.status !== 'available') {
      addError(line, `Copy "${acc}" is not available (status: ${copy.status.replace('_', ' ')})`);
      continue;
    }
    const member = findMember.get(code) as { id: number; name: string } | undefined;
    if (!member) {
      addError(line, `No member with code "${code}" — import members first`);
      continue;
    }
    const checkoutDate = get('checkout_date');
    if (checkoutDate && !DATE_RE.test(checkoutDate)) {
      addError(line, `Invalid checkout_date "${checkoutDate}" — use YYYY-MM-DD or leave blank`);
      continue;
    }
    const dueDate = get('due_date');
    if (dueDate && !DATE_RE.test(dueDate)) {
      addError(line, `Invalid due_date "${dueDate}" — use YYYY-MM-DD or leave blank`);
      continue;
    }
    const co = checkoutDate || todayStr;
    const due =
      dueDate ||
      ((db.prepare('SELECT date(?, ?) AS d').get(co, `+${settings.loan_period_days} days`) as { d: string }).d);
    if (due < co) {
      addError(line, `due_date ${due} is before checkout_date ${co}`);
      continue;
    }
    loans.push({ line, copyId: copy.id, memberId: member.id, checkoutDate: co, dueDate: due });
  }

  if (errors.length > 0 || dryRun) {
    return { dryRun: true, primary: loans.length, secondary: 0, errors };
  }

  const tx = db.transaction(() => {
    const insert = db.prepare(
      `INSERT INTO loans (copy_id, member_id, checkout_date, due_date, checked_out_by) VALUES (?, ?, ?, ?, ?)`,
    );
    const markOnLoan = db.prepare("UPDATE copies SET status = 'on_loan' WHERE id = ?");
    for (const l of loans) {
      insert.run(l.copyId, l.memberId, l.checkoutDate, l.dueDate, getSession()?.id ?? null);
      markOnLoan.run(l.copyId);
    }
  });
  tx();

  logActivity(getSession()?.id ?? null, 'import', `CSV import: ${loans.length} active loan(s)`);
  return { dryRun: false, primary: loans.length, secondary: 0, errors };
}
