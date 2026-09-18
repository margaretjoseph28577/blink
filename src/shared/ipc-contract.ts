import type {
  AccessionRegisterRow,
  ActivityRow,
  CollectionSummaryRow,
  FinePaymentRow,
  OverdueReportRow,
  PopularBookRow,
  BookDetail,
  BookInput,
  BookListRow,
  BookSort,
  BookStatusFilter,
  CatalogStats,
  Copy,
  CopyInput,
  CopyStatus,
  DashboardData,
  FineDetail,
  ImportResult,
  IsbnResult,
  LoanDetail,
  Member,
  MemberDetail,
  MemberInput,
  MemberListRow,
  Paged,
  SessionUser,
  Settings,
  StaffUser,
  StockSummary,
} from './types';

/**
 * The single typed IPC contract. Main registers a handler per channel,
 * preload exposes invoke(channel, payload), renderer wraps it in a typed client.
 */
export interface IpcContract {
  'auth:login': { req: { username: string; password: string }; res: SessionUser };
  'auth:logout': { req: void; res: void };
  'auth:getSession': { req: void; res: SessionUser | null };
  'auth:changePassword': { req: { currentPassword: string; newPassword: string }; res: void };
  'auth:createMemberLogin': { req: { memberId: number; username: string; password: string }; res: void };

  'books:list': {
    req: {
      search?: string;
      category?: string;
      resourceType?: string;
      status?: BookStatusFilter;
      location?: string;
      sort?: BookSort;
      dir?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    };
    res: Paged<BookListRow>;
  };
  'books:stats': { req: void; res: CatalogStats };
  'books:get': { req: { id: number }; res: BookDetail };
  'books:create': { req: { book: BookInput; copies: CopyInput[] }; res: { id: number } };
  'books:update': { req: { id: number; book: BookInput }; res: void };
  'books:delete': { req: { id: number }; res: void };
  'books:categories': { req: void; res: string[] };

  'copies:add': { req: { bookId: number; copy: CopyInput }; res: Copy };
  'copies:update': { req: { id: number; copy: Partial<CopyInput> & { status?: CopyStatus } }; res: void };
  'copies:remove': { req: { id: number }; res: void };

  'isbn:lookup': { req: { isbn: string }; res: IsbnResult | null };

  'members:list': { req: { search?: string; status?: string }; res: MemberListRow[] };
  'members:get': { req: { id: number }; res: MemberDetail };
  'members:create': { req: { member: MemberInput }; res: Member };
  'members:update': { req: { id: number; member: MemberInput }; res: void };
  'members:delete': { req: { id: number }; res: void };

  'circ:checkout': { req: { accessionNumber: string; memberId: number }; res: LoanDetail };
  'circ:checkin': { req: { accessionNumber: string }; res: { loan: LoanDetail; finePaise: number } };
  'circ:renew': { req: { loanId: number }; res: LoanDetail };
  'circ:unrenew': { req: { loanId: number }; res: LoanDetail };
  'loans:list': {
    req: { memberId?: number; filter?: 'active' | 'returned' | 'overdue' | 'all' };
    res: LoanDetail[];
  };

  'fines:list': { req: { memberId?: number; status?: string }; res: FineDetail[] };
  'fines:recordPayment': { req: { fineId: number; amountPaise: number; note?: string }; res: void };
  'fines:waive': { req: { fineId: number }; res: void };

  'reports:dashboard': { req: void; res: DashboardData };
  'activity:list': {
    req: { page?: number; pageSize?: number; action?: string };
    res: Paged<ActivityRow>;
  };
  'reports:accessionRegister': {
    req: { fromDate?: string; toDate?: string };
    res: AccessionRegisterRow[];
  };
  'reports:circulation': {
    req: { fromDate?: string; toDate?: string; status?: 'active' | 'returned' | 'overdue' };
    res: LoanDetail[];
  };
  'reports:overdue': { req: void; res: OverdueReportRow[] };
  'reports:fineCollections': {
    req: { fromDate?: string; toDate?: string };
    res: { rows: FinePaymentRow[]; totalPaise: number };
  };
  'reports:collectionSummary': {
    req: void;
    res: { rows: CollectionSummaryRow[]; totals: CollectionSummaryRow };
  };
  'reports:popular': {
    req: { fromDate?: string; toDate?: string; limit?: number };
    res: PopularBookRow[];
  };
  'reports:exportCsv': {
    req: { filename: string; headers: string[]; rows: (string | number | null)[][] };
    res: { savedPath: string | null };
  };

  'stock:begin': { req: void; res: void };
  'stock:scan': {
    req: { accessionNumber: string };
    res: { found: boolean; title?: string; accession_number?: string; alreadyScanned?: boolean };
  };
  'stock:summary': { req: void; res: StockSummary };
  'stock:markMissingLost': { req: { copyIds: number[] }; res: void };

  'settings:get': { req: void; res: Settings };
  'settings:update': { req: { patch: Partial<Settings> }; res: Settings };
  'backup:run': { req: void; res: { savedPath: string | null } };
  'backup:pickDir': { req: void; res: { path: string | null } };
  'backup:restore': { req: void; res: { restored: boolean } };
  'cover:read': { req: { bookId: number }; res: string | null };
  'memberPhoto:read': { req: { memberId: number }; res: string | null };

  'import:pickCsv': { req: void; res: { csvText: string; filename: string } | null };
  'import:booksCsv': { req: { csvText: string; dryRun: boolean }; res: ImportResult };
  'import:membersCsv': { req: { csvText: string; dryRun: boolean }; res: ImportResult };
  'import:loansCsv': { req: { csvText: string; dryRun: boolean }; res: ImportResult };

  'staff:list': { req: void; res: StaffUser[] };
  'staff:create': { req: { username: string; password: string }; res: void };
  'staff:setPassword': { req: { userId: number; newPassword: string }; res: void };
  'staff:setActive': { req: { userId: number; active: boolean }; res: void };
}

export type IpcChannel = keyof IpcContract;
export type IpcReq<C extends IpcChannel> = IpcContract[C]['req'];
export type IpcRes<C extends IpcChannel> = IpcContract[C]['res'];

export type IpcEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

/** Channels a member-role session may call. Everything else is librarian-only. */
export const MEMBER_ALLOWED: ReadonlySet<string> = new Set<IpcChannel>([
  'auth:login',
  'auth:logout',
  'auth:getSession',
  'auth:changePassword',
  'books:list',
  'books:get',
  'books:categories',
  'loans:list',
  'fines:list',
  'settings:get',
  'cover:read',
]);

/** Channels callable with no session at all (login screen). */
export const PUBLIC_CHANNELS: ReadonlySet<string> = new Set<IpcChannel>([
  'auth:login',
  'auth:getSession',
  'settings:get',
]);
