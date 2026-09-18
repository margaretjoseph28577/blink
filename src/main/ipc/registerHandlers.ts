import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MEMBER_ALLOWED, PUBLIC_CHANNELS } from '../../shared/ipc-contract';
import type { IpcChannel, IpcEnvelope } from '../../shared/ipc-contract';
import * as auth from '../services/authService';
import * as books from '../services/bookService';
import * as members from '../services/memberService';
import * as circ from '../services/circulationService';
import * as fines from '../services/fineService';
import * as reports from '../services/reportService';
import * as activity from '../services/activityService';
import * as stock from '../services/stockService';
import * as settings from '../services/settingsService';
import * as backups from '../services/backupService';
import { importBooksCsv, importLoansCsv, importMembersCsv } from '../services/importService';
import { lookupIsbn } from '../services/isbnLookupService';

const id = z.number().int().positive();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bookInput = z.object({
  title: z.string().min(1),
  authors: z.string(),
  isbn: z.string().nullable(),
  publisher: z.string().nullable(),
  place: z.string().nullable(),
  year: z.number().int().nullable(),
  edition: z.string().nullable(),
  volume: z.string().nullable(),
  pages: z.string().nullable(),
  subject: z.string().nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  resource_type: z.enum(['book', 'magazine', 'cd', 'dvd', 'reference']).optional(),
  coverDataUrl: z.string().nullable().optional(),
});

const copyInput = z.object({
  accession_number: z.string().nullable().optional(),
  accession_date: dateStr,
  binding: z.string().nullable(),
  source: z.string().nullable(),
  bill_no: z.string().nullable(),
  cost_paise: z.number().int().nonnegative().nullable(),
  remarks: z.string().nullable(),
  shelf_location: z.string().nullable(),
});

const memberInput = z.object({
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  join_date: dateStr,
  status: z.enum(['active', 'suspended', 'expired']),
  notes: z.string().nullable(),
  member_type: z.enum(['student', 'staff']).optional(),
  class_name: z.string().max(20).nullable().optional(),
  section: z.string().max(10).nullable().optional(),
  roll_no: z.string().max(20).nullable().optional(),
  guardian_name: z.string().max(120).nullable().optional(),
  guardian_phone: z.string().max(30).nullable().optional(),
  photoDataUrl: z.string().nullable().optional(),
});

interface HandlerDef {
  schema: z.ZodType | null;
  fn: (payload: never) => unknown;
}

const handlers = new Map<string, HandlerDef>();

function handle<C extends IpcChannel>(
  channel: C,
  schema: z.ZodType | null,
  fn: (payload: never) => unknown,
): void {
  handlers.set(channel, { schema, fn });
}

/**
 * Execute one channel with the same guard the renderer goes through.
 * Enforces role access server-side:
 * - no session → only PUBLIC_CHANNELS
 * - member role → only MEMBER_ALLOWED, with member-scoped data enforced per-handler
 * Exported so tests can exercise the real guard + validation + services.
 */
export async function dispatch(channel: string, payload: unknown): Promise<IpcEnvelope<unknown>> {
  try {
    const def = handlers.get(channel);
    if (!def) throw new Error(`Unknown channel: ${channel}`);
    const session = auth.getSession();
    if (!session && !PUBLIC_CHANNELS.has(channel)) {
      throw new Error('Not logged in');
    }
    if (session?.role === 'member' && !MEMBER_ALLOWED.has(channel)) {
      throw new Error('Not permitted');
    }
    const parsed = def.schema ? def.schema.parse(payload ?? {}) : payload;
    const data = await def.fn(parsed as never);
    return { ok: true, data };
  } catch (err) {
    const message =
      err instanceof z.ZodError
        ? 'Invalid input'
        : err instanceof Error
          ? err.message
          : String(err);
    return { ok: false, error: message };
  }
}

/** Members may only see their own loans/fines regardless of what they ask for. */
function scopeMemberId(requested: number | undefined): number | undefined {
  const session = auth.getSession();
  if (session?.role === 'member') return session.memberId ?? -1;
  return requested;
}

function csvEscape(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Define every channel handler (no Electron IPC wiring — used directly by tests). */
export function buildHandlers(): void {
  if (handlers.size > 0) return;
  // --- auth ---
  handle('auth:login', z.object({ username: z.string(), password: z.string() }), (p: { username: string; password: string }) =>
    auth.login(p.username, p.password),
  );
  handle('auth:logout', null, () => auth.logout());
  handle('auth:getSession', null, () => auth.getSession());
  handle(
    'auth:changePassword',
    z.object({ currentPassword: z.string(), newPassword: z.string() }),
    (p: { currentPassword: string; newPassword: string }) => auth.changePassword(p.currentPassword, p.newPassword),
  );
  handle(
    'auth:createMemberLogin',
    z.object({ memberId: id, username: z.string().min(2), password: z.string() }),
    (p: { memberId: number; username: string; password: string }) => auth.createMemberLogin(p.memberId, p.username, p.password),
  );

  // --- books / copies ---
  handle(
    'books:list',
    z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      resourceType: z.string().optional(),
      status: z.enum(['available', 'issued', 'lost_damaged', 'withdrawn']).optional(),
      location: z.string().optional(),
      sort: z.enum(['title', 'authors', 'year', 'category', 'copies', 'available']).optional(),
      dir: z.enum(['asc', 'desc']).optional(),
      page: z.number().int().optional(),
      pageSize: z.number().int().optional(),
    }),
    (p: Parameters<typeof books.listBooks>[0]) => books.listBooks(p),
  );
  handle('books:stats', null, () => books.getCatalogStats());
  handle('books:get', z.object({ id }), (p: { id: number }) => books.getBookDetail(p.id));
  handle(
    'books:create',
    z.object({ book: bookInput, copies: z.array(copyInput) }),
    (p: { book: z.infer<typeof bookInput>; copies: z.infer<typeof copyInput>[] }) =>
      books.createBook(p.book, p.copies),
  );
  handle('books:update', z.object({ id, book: bookInput }), (p: { id: number; book: z.infer<typeof bookInput> }) =>
    books.updateBook(p.id, p.book),
  );
  handle('books:delete', z.object({ id }), (p: { id: number }) => books.deleteBook(p.id));
  handle('books:categories', null, () => books.listCategories());
  handle('cover:read', z.object({ bookId: id }), (p: { bookId: number }) => books.readCoverDataUrl(p.bookId));

  handle('copies:add', z.object({ bookId: id, copy: copyInput }), (p: { bookId: number; copy: z.infer<typeof copyInput> }) =>
    books.addCopy(p.bookId, p.copy),
  );
  handle(
    'copies:update',
    z.object({
      id,
      copy: copyInput.partial().extend({
        status: z.enum(['available', 'on_loan', 'lost', 'damaged', 'withdrawn']).optional(),
      }),
    }),
    (p: { id: number; copy: Parameters<typeof books.updateCopy>[1] }) => books.updateCopy(p.id, p.copy),
  );
  handle('copies:remove', z.object({ id }), (p: { id: number }) => books.removeCopy(p.id));

  handle('isbn:lookup', z.object({ isbn: z.string().min(9) }), (p: { isbn: string }) => lookupIsbn(p.isbn));

  // --- members ---
  handle(
    'members:list',
    z.object({ search: z.string().optional(), status: z.string().optional() }),
    (p: Parameters<typeof members.listMembers>[0]) => members.listMembers(p),
  );
  handle('members:get', z.object({ id }), (p: { id: number }) => members.getMemberDetail(p.id));
  handle('members:create', z.object({ member: memberInput }), (p: { member: z.infer<typeof memberInput> }) =>
    members.createMember(p.member),
  );
  handle('members:update', z.object({ id, member: memberInput }), (p: { id: number; member: z.infer<typeof memberInput> }) =>
    members.updateMember(p.id, p.member),
  );
  handle('members:delete', z.object({ id }), (p: { id: number }) => members.deleteMember(p.id));
  handle('memberPhoto:read', z.object({ memberId: id }), (p: { memberId: number }) =>
    members.readPhotoDataUrl(p.memberId),
  );

  // --- circulation ---
  handle(
    'circ:checkout',
    z.object({ accessionNumber: z.string().min(1), memberId: id }),
    (p: { accessionNumber: string; memberId: number }) => circ.checkout(p.accessionNumber, p.memberId),
  );
  handle('circ:checkin', z.object({ accessionNumber: z.string().min(1) }), (p: { accessionNumber: string }) =>
    circ.checkin(p.accessionNumber),
  );
  handle('circ:renew', z.object({ loanId: id }), (p: { loanId: number }) => circ.renew(p.loanId));
  handle('circ:unrenew', z.object({ loanId: id }), (p: { loanId: number }) => circ.unrenew(p.loanId));
  handle(
    'loans:list',
    z.object({
      memberId: id.optional(),
      filter: z.enum(['active', 'returned', 'overdue', 'all']).optional(),
    }),
    (p: { memberId?: number; filter?: 'active' | 'returned' | 'overdue' | 'all' }) =>
      circ.listLoans({ memberId: scopeMemberId(p.memberId), filter: p.filter }),
  );

  // --- fines ---
  handle(
    'fines:list',
    z.object({ memberId: id.optional(), status: z.string().optional() }),
    (p: { memberId?: number; status?: string }) =>
      fines.listFines({ memberId: scopeMemberId(p.memberId), status: p.status }),
  );
  handle(
    'fines:recordPayment',
    z.object({ fineId: id, amountPaise: z.number().int().positive(), note: z.string().optional() }),
    (p: { fineId: number; amountPaise: number; note?: string }) =>
      fines.recordPayment(p.fineId, p.amountPaise, p.note),
  );
  handle('fines:waive', z.object({ fineId: id }), (p: { fineId: number }) => fines.waiveFine(p.fineId));

  // --- reports ---
  handle('reports:dashboard', null, () => reports.getDashboard());
  handle(
    'activity:list',
    z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
      action: z.string().optional(),
    }),
    (p: { page?: number; pageSize?: number; action?: string }) => activity.listActivity(p),
  );
  handle(
    'reports:accessionRegister',
    z.object({ fromDate: dateStr.optional(), toDate: dateStr.optional() }),
    (p: { fromDate?: string; toDate?: string }) => reports.getAccessionRegister(p),
  );
  handle(
    'reports:circulation',
    z.object({
      fromDate: dateStr.optional(),
      toDate: dateStr.optional(),
      status: z.enum(['active', 'returned', 'overdue']).optional(),
    }),
    (p: Parameters<typeof reports.getCirculationReport>[0]) => reports.getCirculationReport(p),
  );
  handle('reports:overdue', null, () => reports.getOverdueReport());
  handle(
    'reports:fineCollections',
    z.object({ fromDate: dateStr.optional(), toDate: dateStr.optional() }),
    (p: { fromDate?: string; toDate?: string }) => reports.getFineCollections(p),
  );
  handle('reports:collectionSummary', null, () => reports.getCollectionSummary());
  handle(
    'reports:popular',
    z.object({
      fromDate: dateStr.optional(),
      toDate: dateStr.optional(),
      limit: z.number().int().positive().optional(),
    }),
    (p: Parameters<typeof reports.getPopularBooks>[0]) => reports.getPopularBooks(p),
  );
  handle(
    'reports:exportCsv',
    z.object({
      filename: z.string().min(1),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    }),
    async (p: { filename: string; headers: string[]; rows: (string | number | null)[][] }) => {
      const win = BrowserWindow.getFocusedWindow();
      const result = await dialog.showSaveDialog(win ?? BrowserWindow.getAllWindows()[0], {
        defaultPath: p.filename,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return { savedPath: null };
      const lines = [p.headers.map(csvEscape).join(','), ...p.rows.map((r) => r.map(csvEscape).join(','))];
      // UTF-8 BOM so Excel renders ₹ and other non-ASCII correctly.
      fs.writeFileSync(result.filePath, '﻿' + lines.join('\r\n'), 'utf8');
      return { savedPath: result.filePath };
    },
  );

  // --- stock verification ---
  handle('stock:begin', null, () => stock.beginStockSession());
  handle('stock:scan', z.object({ accessionNumber: z.string().min(1) }), (p: { accessionNumber: string }) =>
    stock.scanCopy(p.accessionNumber),
  );
  handle('stock:summary', null, () => stock.getStockSummary());
  handle('stock:markMissingLost', z.object({ copyIds: z.array(id) }), (p: { copyIds: number[] }) =>
    stock.markMissingLost(p.copyIds),
  );

  // --- settings / backup ---
  handle('settings:get', null, () => settings.getSettings());
  handle('settings:update', z.object({ patch: z.record(z.string(), z.union([z.string(), z.number()])) }), (p: { patch: Record<string, string | number> }) =>
    settings.updateSettings(p.patch),
  );
  handle('backup:run', null, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { savedPath: null };
    return { savedPath: backups.runBackupTo(result.filePaths[0]) };
  });
  handle('backup:pickDir', null, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Choose automatic backup folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return { path: result.canceled ? null : (result.filePaths[0] ?? null) };
  });
  handle('backup:restore', null, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Choose a backup folder to restore (library-backup-…)',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return { restored: false };
    backups.restoreFromBackup(result.filePaths[0]);
    // Relaunch so every window and cache starts fresh on the restored database.
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 300);
    return { restored: true };
  });

  // --- CSV import ---
  handle('import:pickCsv', null, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? BrowserWindow.getAllWindows()[0], {
      title: 'Choose a CSV file to import',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    if (fs.statSync(filePath).size > 10 * 1024 * 1024) {
      throw new Error('CSV file is too large (max 10 MB)');
    }
    return { csvText: fs.readFileSync(filePath, 'utf8'), filename: path.basename(filePath) };
  });
  handle(
    'import:booksCsv',
    z.object({ csvText: z.string().min(1), dryRun: z.boolean() }),
    (p: { csvText: string; dryRun: boolean }) => importBooksCsv(p.csvText, p.dryRun),
  );
  handle(
    'import:membersCsv',
    z.object({ csvText: z.string().min(1), dryRun: z.boolean() }),
    (p: { csvText: string; dryRun: boolean }) => importMembersCsv(p.csvText, p.dryRun),
  );
  handle(
    'import:loansCsv',
    z.object({ csvText: z.string().min(1), dryRun: z.boolean() }),
    (p: { csvText: string; dryRun: boolean }) => importLoansCsv(p.csvText, p.dryRun),
  );

  // --- staff accounts ---
  handle('staff:list', null, () => auth.listStaff());
  handle(
    'staff:create',
    z.object({ username: z.string(), password: z.string() }),
    (p: { username: string; password: string }) => auth.createStaff(p.username, p.password),
  );
  handle(
    'staff:setPassword',
    z.object({ userId: id, newPassword: z.string() }),
    (p: { userId: number; newPassword: string }) => auth.setStaffPassword(p.userId, p.newPassword),
  );
  handle(
    'staff:setActive',
    z.object({ userId: id, active: z.boolean() }),
    (p: { userId: number; active: boolean }) => auth.setStaffActive(p.userId, p.active),
  );
}

/** Wire every handler onto Electron IPC through the guarded dispatch. */
export function registerIpcHandlers(): void {
  buildHandlers();
  for (const channel of handlers.keys()) {
    ipcMain.handle(channel, (_event, payload: unknown) => dispatch(channel, payload));
  }
}
