/**
 * End-to-end backend test. Runs inside Electron main (no window) against a
 * temporary userData dir, exercising the real IPC dispatch — guard, zod
 * validation, and services — exactly as the renderer would.
 *
 * Run: npm run test:e2e
 */
import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolate from the real library.db BEFORE any db access.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libmanage-test-'));
app.setPath('userData', tmpDir);

import { buildHandlers, dispatch } from '../src/main/ipc/registerHandlers';
import { seedAdminIfNeeded, logout } from '../src/main/services/authService';
import { getDb, closeDb } from '../src/main/db/connection';
import { normalizeIsbn } from '../src/main/services/isbnLookupService';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, extra?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ok - ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL - ${name}${extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''}`);
  }
}

async function ok<T = any>(channel: string, payload?: unknown): Promise<T> {
  const res = await dispatch(channel, payload);
  if (!res.ok) throw new Error(`${channel} unexpectedly failed: ${res.error}`);
  return res.data as T;
}

async function expectError(name: string, channel: string, payload: unknown, match?: RegExp) {
  const res = await dispatch(channel, payload);
  check(name, !res.ok && (!match || match.test(res.error)), res);
}

async function run() {
  console.log(`# test userData: ${tmpDir}`);
  getDb();
  seedAdminIfNeeded();
  buildHandlers();

  // ---------- auth ----------
  console.log('# auth');
  await expectError('no session blocks librarian channel', 'books:list', {}, /Not logged in/);
  await expectError('wrong password rejected', 'auth:login', { username: 'admin', password: 'nope' }, /Invalid/);
  const admin = await ok('auth:login', { username: 'admin', password: 'admin' });
  check('admin login works', admin.role === 'librarian' && admin.mustChangePassword === true);
  await ok('auth:changePassword', { currentPassword: 'admin', newPassword: 'test1234' });
  await expectError('short password rejected', 'auth:changePassword', { currentPassword: 'test1234', newPassword: 'ab' });

  // ---------- settings ----------
  console.log('# settings');
  const settings = await ok('settings:get');
  check('default loan period 14', settings.loan_period_days === 14);
  check('default currency ₹', settings.currency_symbol === '₹');
  check('default fine 100 paise/day', settings.fine_per_day_paise === 100);

  // ---------- catalog + accessioning ----------
  console.log('# catalog');
  const bookInput = {
    title: 'Fantastic Mr Fox',
    authors: 'Roald Dahl',
    isbn: '9780140328721',
    publisher: 'Puffin',
    place: 'London',
    year: 1988,
    edition: '1st',
    volume: null,
    pages: '96',
    subject: 'Fiction',
    category: 'Children',
    description: null,
  };
  const copyBase = {
    accession_date: '2026-08-01',
    binding: 'Paperback',
    source: 'Local Bookstore',
    bill_no: 'B-101',
    cost_paise: 29900,
    remarks: null,
    shelf_location: 'A-1',
  };
  const { id: bookId } = await ok('books:create', {
    book: bookInput,
    copies: [copyBase, copyBase, copyBase],
  });
  const detail = await ok('books:get', { id: bookId });
  const accNums = detail.copies.map((c: any) => c.accession_number);
  check('3 copies accessioned', detail.copies.length === 3, accNums);
  check(
    'accession numbers sequential ACC-0001..3',
    JSON.stringify(accNums) === JSON.stringify(['ACC-0001', 'ACC-0002', 'ACC-0003']),
    accNums,
  );
  const list = await ok('books:list', { search: 'fox' });
  check('search finds book, 3/3 available', list.rows[0]?.available_copies === 3 && list.rows[0]?.total_copies === 3);
  const listByAcc = await ok('books:list', { search: 'ACC-0002' });
  check('search by accession number works', listByAcc.total === 1);
  await expectError('invalid book input rejected', 'books:create', { book: { title: '' }, copies: [] });

  // ---------- members ----------
  console.log('# members');
  const member = await ok('members:create', {
    member: { name: 'Asha Kumar', email: 'asha@example.com', phone: '9999999999', join_date: '2026-08-01', status: 'active', notes: null },
  });
  check('member code auto M-0001', member.member_code === 'M-0001');
  const member2 = await ok('members:create', {
    member: { name: 'Vik Singh', email: null, phone: null, join_date: '2026-08-02', status: 'suspended', notes: null },
  });
  check('member code auto M-0002', member2.member_code === 'M-0002');
  check('member defaults to student type', member.member_type === 'student' && member.class_name === null);
  const student = await ok('members:create', {
    member: {
      name: 'Meera Pillai', email: null, phone: null, join_date: '2026-08-03', status: 'active', notes: null,
      member_type: 'student', class_name: '10', section: 'b', roll_no: '14', guardian_name: 'Suresh Pillai', guardian_phone: '9876500000',
    },
  });
  check('student class fields saved (section upper-cased)', student.class_name === '10' && student.section === 'B' && student.roll_no === '14' && student.guardian_phone === '9876500000', student);
  const teacher = await ok('members:create', {
    member: { name: 'Anil Teacher', email: null, phone: null, join_date: '2026-08-03', status: 'active', notes: null, member_type: 'staff', class_name: '10', roll_no: '1' },
  });
  check('staff never carry class data', teacher.member_type === 'staff' && teacher.class_name === null && teacher.roll_no === null, teacher);
  const byClass = await ok('members:list', { search: '10-B' });
  check('member search matches class-section', byClass.length === 1 && byClass[0].id === student.id, byClass.map((m) => m.name));
  await ok('members:delete', { id: student.id });
  await ok('members:delete', { id: teacher.id });

  // ---------- circulation ----------
  console.log('# circulation');
  const loan = await ok('circ:checkout', { accessionNumber: 'ACC-0001', memberId: member.id });
  // Expected due date must use the LOCAL calendar (UTC date differs after midnight IST).
  const expectedDue = (
    getDb().prepare("SELECT date('now','localtime','+14 days') AS d").get() as { d: string }
  ).d;
  check('due date = today + 14', loan.due_date === expectedDue, loan.due_date);
  await expectError('same copy cannot go out twice', 'circ:checkout', { accessionNumber: 'ACC-0001', memberId: member2.id }, /not available/);
  await expectError('suspended member blocked', 'circ:checkout', { accessionNumber: 'ACC-0002', memberId: member2.id }, /suspended/);
  await ok('circ:checkout', { accessionNumber: 'ACC-0002', memberId: member.id });
  await ok('circ:checkout', { accessionNumber: 'ACC-0003', memberId: member.id });
  // 4th checkout — need another copy
  const { id: book2Id } = await ok('books:create', {
    book: { ...bookInput, title: 'Matilda', isbn: null },
    copies: [copyBase],
  });
  await expectError('max books per member enforced', 'circ:checkout', { accessionNumber: 'ACC-0004', memberId: member.id }, /limit/);

  // renewals
  const renewed = await ok('circ:renew', { loanId: loan.id });
  check('renew extends due date', renewed.due_date > loan.due_date && renewed.renewals_count === 1);
  await ok('circ:renew', { loanId: loan.id });
  await expectError('renewal cap enforced', 'circ:renew', { loanId: loan.id }, /Renewal limit/);

  // on-time check-in: no fine
  const checkin1 = await ok('circ:checkin', { accessionNumber: 'ACC-0002' });
  check('on-time check-in has no fine', checkin1.finePaise === 0);
  const availAfter = await ok('books:get', { id: bookId });
  check('copy available again after check-in', availAfter.copies.find((c: any) => c.accession_number === 'ACC-0002').status === 'available');

  // overdue: backdate ACC-0003's loan by 5 days past due
  const db = getDb();
  db.prepare(
    "UPDATE loans SET due_date = date('now','localtime','-5 days'), checkout_date = date('now','localtime','-19 days') WHERE status='active' AND copy_id = (SELECT id FROM copies WHERE accession_number='ACC-0003')",
  ).run();
  const overdueList = await ok('loans:list', { filter: 'overdue' });
  check('overdue loan detected with 5 days late', overdueList.length === 1 && overdueList[0].days_overdue === 5, overdueList[0]?.days_overdue);
  check('accruing fine = 5 × 100 paise', overdueList[0].accruing_fine_paise === 500);
  await expectError('overdue loan cannot renew', 'circ:renew', { loanId: overdueList[0].id }, /overdue/);
  const checkin2 = await ok('circ:checkin', { accessionNumber: 'ACC-0003' });
  check('late check-in creates fine of 500 paise', checkin2.finePaise === 500);

  // ---------- fines ----------
  console.log('# fines');
  const fines = await ok('fines:list', { status: 'outstanding' });
  check('one outstanding fine', fines.length === 1 && fines[0].amount_paise === 500);
  const fineId = fines[0].id;
  await expectError('overpayment rejected', 'fines:recordPayment', { fineId, amountPaise: 600 }, /exceeds/);
  await ok('fines:recordPayment', { fineId, amountPaise: 200, note: 'part' });
  let fAfter = await ok('fines:list', {});
  check('partial payment keeps outstanding', fAfter[0].status === 'outstanding' && fAfter[0].amount_paid_paise === 200);
  await ok('fines:recordPayment', { fineId, amountPaise: 300 });
  fAfter = await ok('fines:list', {});
  check('full payment marks paid', fAfter[0].status === 'paid');
  await expectError('paid fine cannot be waived', 'fines:waive', { fineId }, /already/);

  // ---------- reports ----------
  console.log('# reports');
  const dash = await ok('reports:dashboard');
  check('dashboard totals correct', dash.totals.titles === 2 && dash.totals.copies === 4 && dash.totals.activeLoans === 1 && dash.totals.overdue === 0, dash.totals);
  const cstats = await ok('books:stats');
  check('catalog stats count titles/copies/availability', cstats.titles === 2 && cstats.copies === 4 && cstats.onLoan === 1 && cstats.available === 3 && cstats.topCategories.length >= 1, cstats);
  const issuedTitles = await ok('books:list', { status: 'issued' });
  check('catalog status facet: issued', issuedTitles.total === 1 && issuedTitles.rows[0].on_loan_copies === 1, issuedTitles);
  const byAvail = await ok('books:list', { sort: 'available', dir: 'desc' });
  check('catalog sort by available copies', byAvail.rows.length === 2 && byAvail.rows[0].available_copies >= byAvail.rows[1].available_copies, byAvail.rows.map((r) => [r.title, r.available_copies]));
  check(
    'dashboard weekly trend covers 7 days ending today',
    dash.weekly.days.length === 7 && dash.weekly.days[6].issued >= 1 && dash.weekly.current.issued >= dash.weekly.days[6].issued,
    dash.weekly,
  );
  check('dashboard weekly fines collected sums payments', dash.weekly.current.finesCollectedPaise === 500, dash.weekly.current);
  check('dashboard lists due-soon loans and categories', Array.isArray(dash.dueSoon) && dash.categories.length >= 1 && dash.categories[0].copies >= 1, {
    dueSoon: dash.dueSoon.length,
    categories: dash.categories,
  });
  const register = await ok('reports:accessionRegister', {});
  check('accession register has 4 rows', register.length === 4);
  const r0 = register[0];
  check(
    'register row carries full accession record',
    r0.accession_number === 'ACC-0001' && r0.authors === 'Roald Dahl' && r0.bill_no === 'B-101' &&
      r0.cost_paise === 29900 && r0.binding === 'Paperback' && r0.place === 'London' && r0.subject === 'Fiction',
    r0,
  );
  const registerFiltered = await ok('reports:accessionRegister', { fromDate: '2026-09-01' });
  check('register date filter works', registerFiltered.length === 0);

  // Loans so far: ACC-0001 active, ACC-0002 + ACC-0003 returned (4th checkout was blocked).
  const circReport = await ok('reports:circulation', {});
  check('circulation report lists all loans', circReport.length === 3, circReport.length);
  const circReturned = await ok('reports:circulation', { status: 'returned' });
  check('circulation report status filter', circReturned.length === 2);
  const overdueReport = await ok('reports:overdue');
  check('overdue report empty when nothing late', overdueReport.length === 0);
  const collections = await ok('reports:fineCollections', {});
  check(
    'fine collections total = 500 paise over 2 payments',
    collections.rows.length === 2 && collections.totalPaise === 500,
    collections,
  );
  const summary2 = await ok('reports:collectionSummary');
  check(
    'collection summary totals correct',
    summary2.totals.titles === 2 && summary2.totals.copies === 4 &&
      summary2.totals.total_cost_paise === 4 * 29900,
    summary2.totals,
  );
  const popular = await ok('reports:popular', {});
  check(
    'popular report counts loans and borrowers',
    popular[0]?.loan_count === 3 && popular[0]?.unique_borrowers === 1,
    popular[0],
  );

  // ---------- stock verification ----------
  console.log('# stock');
  await ok('stock:begin');
  const scanHit = await ok('stock:scan', { accessionNumber: 'ACC-0002' });
  check('stock scan finds copy', scanHit.found === true);
  const scanMiss = await ok('stock:scan', { accessionNumber: 'ZZZ-9999' });
  check('stock scan reports unknown accession', scanMiss.found === false);
  const summary = await ok('stock:summary');
  // ACC-0001 on loan (excluded), ACC-0002 scanned; missing = ACC-0003 + ACC-0004
  check('stock missing list correct', summary.verifiedCount === 1 && summary.missing.length === 2, {
    verified: summary.verifiedCount,
    missing: summary.missing.map((m: any) => m.accession_number),
  });
  await ok('stock:markMissingLost', { copyIds: [summary.missing[0].id] });
  const afterLost = await ok('stock:summary');
  check('marking lost shrinks missing list', afterLost.missing.length === 1);

  // ---------- member role security ----------
  console.log('# member-role security');
  await ok('auth:createMemberLogin', { memberId: member.id, username: 'asha', password: 'pass1234' });
  logout();
  const memberSession = await ok('auth:login', { username: 'asha', password: 'pass1234' });
  check('member login works', memberSession.role === 'member' && memberSession.memberId === member.id);
  await expectError('member cannot create books', 'books:create', { book: bookInput, copies: [] }, /Not permitted/);
  await expectError('member cannot checkout', 'circ:checkout', { accessionNumber: 'ACC-0004', memberId: member.id }, /Not permitted/);
  await expectError('member cannot read dashboard', 'reports:dashboard', undefined, /Not permitted/);
  await expectError('member cannot change settings', 'settings:update', { patch: { loan_period_days: 99 } }, /Not permitted/);
  await expectError('member cannot list members', 'members:list', {}, /Not permitted/);
  const myLoans = await ok('loans:list', { memberId: member2.id }); // asks for someone else's
  check(
    'member loans are scoped to self even when requesting another id',
    myLoans.every((l: any) => l.member_id === member.id),
    myLoans.map((l: any) => l.member_id),
  );
  const myFines = await ok('fines:list', { memberId: member2.id });
  check('member fines scoped to self', myFines.every((f: any) => f.member_id === member.id));
  const opac = await ok('books:list', { search: 'fox' });
  check('member can search catalog', opac.total >= 1);

  // ---------- isbn normalization (offline unit) ----------
  console.log('# isbn');
  const n = normalizeIsbn('0-14-032872-6');
  check('ISBN-10 → ISBN-13 conversion', n.isbn13 === '9780140328721', n);
  const n2 = normalizeIsbn('9780140328721');
  check('ISBN-13 → ISBN-10 conversion', n2.isbn10 === '0140328726', n2);

  // ---------- deletion guards ----------
  console.log('# deletion guards');
  logout();
  await ok('auth:login', { username: 'admin', password: 'test1234' });
  await expectError('cannot delete title with copies on loan', 'books:delete', { id: bookId }, /on loan/);
  await expectError('cannot delete member with active loans', 'members:delete', { id: member.id }, /on loan/);

  // ---------- csv import ----------
  console.log('# csv import');
  const csv = [
    'title,authors,isbn,year,accession_number,cost',
    '"The Jungle Book","Rudyard Kipling",9780141325295,2009,IMP-001,150',
    '"The Jungle Book","Rudyard Kipling",9780141325295,2009,IMP-002,150',
    '"Malgudi Days","R.K. Narayan",,2006,,99.50',
  ].join('\r\n');
  const dry = await ok('import:booksCsv', { csvText: csv, dryRun: true });
  check('import dry run counts 2 titles 3 copies', dry.dryRun && dry.primary === 2 && dry.secondary === 3, dry);
  check('import dry run has no errors', dry.errors.length === 0, dry.errors);
  const imp = await ok('import:booksCsv', { csvText: csv, dryRun: false });
  check('import creates 2 titles 3 copies', !imp.dryRun && imp.primary === 2 && imp.secondary === 3, imp);
  const imported = await ok('books:list', { search: 'Jungle Book' });
  check('imported title has 2 copies', imported.rows[0]?.total_copies === 2, imported.rows[0]);
  const impCost = await ok('books:list', { search: 'Malgudi' });
  check('import title without accession gets auto number', impCost.total === 1);
  const dupDry = await ok('import:booksCsv', { csvText: csv, dryRun: true });
  check(
    'reimport flags existing accession numbers',
    dupDry.errors.some((e: any) => /already exists/.test(e.message)),
    dupDry.errors,
  );
  const badCsv = 'title,year\n"No Year Book",abcd';
  const badDry = await ok('import:booksCsv', { csvText: badCsv, dryRun: false });
  check(
    'invalid rows block the import even without dryRun',
    badDry.dryRun === true && badDry.errors.some((e: any) => /Invalid year/.test(e.message)),
    badDry,
  );

  // ---------- staff accounts ----------
  console.log('# staff accounts');
  await ok('staff:create', { username: 'assistant', password: 'temp1234' });
  const staff = await ok('staff:list');
  check('staff list has admin + assistant', staff.length === 2, staff);
  await expectError('duplicate staff username rejected', 'staff:create', { username: 'assistant', password: 'x1234' }, /taken/);
  const adminRow = staff.find((s: any) => s.username === 'admin');
  const assistantRow = staff.find((s: any) => s.username === 'assistant');
  await expectError('cannot deactivate own account', 'staff:setActive', { userId: adminRow.id, active: false }, /own account/);
  await ok('staff:setActive', { userId: assistantRow.id, active: false });
  await expectError(
    'cannot deactivate last active staff',
    'staff:setActive',
    { userId: adminRow.id, active: false },
    /own account|last active/,
  );
  await ok('staff:setActive', { userId: assistantRow.id, active: true });
  logout();
  const assistant = await ok('auth:login', { username: 'assistant', password: 'temp1234' });
  check('new staff must change password at first login', assistant.mustChangePassword === true);
  check('new staff is a librarian', assistant.role === 'librarian');
  logout();
  await ok('auth:login', { username: 'admin', password: 'test1234' });
  const dash2 = await ok('reports:dashboard');
  check('dashboard exposes accruing fines total', typeof dash2.totals.accruingFinesPaise === 'number');

  // ---------- member + loan csv import ----------
  console.log('# member and loan csv import');
  const memberCsv = [
    'name,member_code,join_date,status,username,password',
    '"Kavya Pillai",,2026-06-01,active,kavya.p,welcome1',
    '"Dev Anand",STU-2026-042,,,,',
  ].join('\n');
  const mDry = await ok('import:membersCsv', { csvText: memberCsv, dryRun: true });
  check('member import dry run: 2 members 1 login', mDry.dryRun && mDry.primary === 2 && mDry.secondary === 1, mDry);
  const mImp = await ok('import:membersCsv', { csvText: memberCsv, dryRun: false });
  check('member import creates 2 members 1 login', !mImp.dryRun && mImp.primary === 2 && mImp.secondary === 1, mImp);
  const importedMembers = await ok('members:list', { search: 'STU-2026-042' });
  check('explicit member code kept', importedMembers.length === 1 && importedMembers[0].name === 'Dev Anand');
  const mDup = await ok('import:membersCsv', { csvText: memberCsv, dryRun: true });
  check(
    'reimport flags taken code and username',
    mDup.errors.some((e: any) => /already exists/.test(e.message)) &&
      mDup.errors.some((e: any) => /already taken/.test(e.message)),
    mDup.errors,
  );

  const loanCsv = [
    'accession_number,member_code,checkout_date,due_date',
    'IMP-001,STU-2026-042,2026-08-20,',
  ].join('\n');
  const lDry = await ok('import:loansCsv', { csvText: loanCsv, dryRun: true });
  check('loan import dry run: 1 loan no errors', lDry.dryRun && lDry.primary === 1 && lDry.errors.length === 0, lDry);
  const lImp = await ok('import:loansCsv', { csvText: loanCsv, dryRun: false });
  check('loan import creates 1 active loan', !lImp.dryRun && lImp.primary === 1, lImp);
  const migratedLoans = await ok('loans:list', { filter: 'active' });
  const migrated = migratedLoans.find((l: any) => l.accession_number === 'IMP-001');
  check(
    'migrated loan is active with due = checkout + loan period',
    migrated && migrated.member_code === 'STU-2026-042' && migrated.due_date === '2026-09-03',
    migrated,
  );
  const lDup = await ok('import:loansCsv', { csvText: loanCsv, dryRun: true });
  check(
    'reimport flags copy already on loan',
    lDup.errors.some((e: any) => /not available/.test(e.message)),
    lDup.errors,
  );
  const lBadMember = await ok('import:loansCsv', {
    csvText: 'accession_number,member_code\nIMP-002,NO-SUCH',
    dryRun: false,
  });
  check(
    'loan import blocks on unknown member',
    lBadMember.dryRun === true && lBadMember.errors.some((e: any) => /No member/.test(e.message)),
    lBadMember,
  );
  logout();
  const importedLogin = await ok('auth:login', { username: 'kavya.p', password: 'welcome1' });
  check(
    'imported member login works and must change password',
    importedLogin.role === 'member' && importedLogin.mustChangePassword === true,
  );
  logout();
  await ok('auth:login', { username: 'admin', password: 'test1234' });

  // ---------- member photos ----------
  console.log('# member photos');
  check('member without photo reads null', (await ok('memberPhoto:read', { memberId: member.id })) === null);
  const onePixelPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await ok('members:update', {
    id: member.id,
    member: {
      name: member.name,
      email: member.email,
      phone: member.phone,
      join_date: member.join_date,
      status: 'active',
      notes: member.notes,
      photoDataUrl: onePixelPng,
    },
  });
  const photo = await ok('memberPhoto:read', { memberId: member.id });
  check('saved photo reads back as png data URL', typeof photo === 'string' && photo.startsWith('data:image/png;base64,'));

  // ---------- resource types ----------
  console.log('# resource types');
  await ok('books:create', {
    book: { ...bookInput, title: 'Sports Weekly', isbn: null, resource_type: 'magazine' },
    copies: [],
  });
  const mags = await ok('books:list', { resourceType: 'magazine' });
  check('resource type filter finds the magazine', mags.total === 1 && mags.rows[0].title === 'Sports Weekly');
  const legacy = await ok('books:list', { search: 'Fantastic' });
  check('existing titles default to type book', legacy.rows[0].resource_type === 'book');
  const badType = await dispatch('books:create', {
    book: { ...bookInput, title: 'Bad Type', resource_type: 'cassette' },
    copies: [],
  });
  check('invalid resource type rejected', !badType.ok);

  console.log(`\n# ${passed} passed, ${failed} failed`);
  if (failed > 0) console.error(`Failures:\n - ${failures.join('\n - ')}`);
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  app.exit(failed > 0 ? 1 : 0);
}

app.whenReady().then(() =>
  run().catch((err) => {
    console.error('TEST HARNESS CRASH:', err);
    app.exit(2);
  }),
);
