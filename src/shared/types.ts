export type Role = 'librarian' | 'member';

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  memberId: number | null;
  mustChangePassword: boolean;
}

export interface Settings {
  library_name: string;
  currency_symbol: string;
  loan_period_days: number;
  max_books_per_member: number;
  fine_per_day_paise: number;
  max_renewals: number;
  accession_prefix: string;
  accession_next_seq: number;
  /** Folder for automatic backups; empty = disabled */
  backup_dir: string;
  /** Timestamp of the last automatic backup (local, YYYY-MM-DD HH:MM:SS) */
  backup_auto_last: string;
}

export interface StaffUser {
  id: number;
  username: string;
  is_active: number;
  created_at: string;
}

/** Column order for the catalog CSV import template. One row per copy. */
export const BOOK_IMPORT_TEMPLATE_HEADERS = [
  'title', 'authors', 'isbn', 'publisher', 'place', 'year', 'edition', 'volume', 'pages',
  'subject', 'category', 'description', 'resource_type', 'accession_number', 'accession_date',
  'binding', 'source', 'bill_no', 'cost', 'shelf_location', 'remarks',
];

/** One row per member; username+password (optional) also create an OPAC login. */
export const MEMBER_IMPORT_TEMPLATE_HEADERS = [
  'name', 'member_code', 'member_type', 'class', 'section', 'roll_no', 'guardian_name', 'guardian_phone',
  'email', 'phone', 'join_date', 'status', 'notes', 'username', 'password',
];

/** One row per active loan, for migrating from another system. */
export const LOAN_IMPORT_TEMPLATE_HEADERS = [
  'accession_number', 'member_code', 'checkout_date', 'due_date',
];

export interface ImportRowError {
  /** 1-based line number in the CSV file (header is line 1) */
  line: number;
  message: string;
}

export interface ImportResult {
  dryRun: boolean;
  /** main records created or counted: titles / members / loans */
  primary: number;
  /** related records: copies for books, OPAC logins for members; 0 when not applicable */
  secondary: number;
  errors: ImportRowError[];
}

export type ResourceType = 'book' | 'magazine' | 'cd' | 'dvd' | 'reference';
export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'magazine', label: 'Magazine' },
  { value: 'cd', label: 'CD' },
  { value: 'dvd', label: 'DVD' },
  { value: 'reference', label: 'Reference' },
];

export type CopyStatus = 'available' | 'on_loan' | 'lost' | 'damaged' | 'withdrawn';
export type MemberStatus = 'active' | 'suspended' | 'expired';
/** School library: members are either students (class/section/roll) or staff. */
export type MemberType = 'student' | 'staff';
export type LoanStatus = 'active' | 'returned';
export type FineStatus = 'outstanding' | 'paid' | 'waived';

export interface BookInput {
  title: string;
  authors: string;
  isbn: string | null;
  publisher: string | null;
  place: string | null;
  year: number | null;
  edition: string | null;
  volume: string | null;
  pages: string | null;
  subject: string | null;
  category: string | null;
  description: string | null;
  /** defaults to 'book' when omitted */
  resource_type?: ResourceType;
  /** data URL of a cover image to save, or null to keep/clear */
  coverDataUrl?: string | null;
}

export interface Book {
  id: number;
  title: string;
  authors: string;
  isbn: string | null;
  publisher: string | null;
  place: string | null;
  year: number | null;
  edition: string | null;
  volume: string | null;
  pages: string | null;
  subject: string | null;
  category: string | null;
  description: string | null;
  resource_type: ResourceType;
  cover_path: string | null;
  created_at: string;
}

export interface BookListRow extends Book {
  /** copies in the collection (not withdrawn / lost) */
  total_copies: number;
  available_copies: number;
  on_loan_copies: number;
  /** distinct shelf locations of this title's copies, comma-separated; null if none recorded */
  shelf_locations: string | null;
}

/** Copy-status facet for the catalog list. */
export type BookStatusFilter = 'available' | 'issued' | 'lost_damaged' | 'withdrawn';
export type BookSort = 'title' | 'authors' | 'year' | 'category' | 'copies' | 'available';

export interface CatalogStats {
  titles: number;
  copies: number;
  available: number;
  onLoan: number;
  lostDamaged: number;
  withdrawn: number;
  categories: number;
  publishers: number;
  topCategories: { category: string; copies: number }[];
  /** distinct shelf locations, for the location filter */
  locations: string[];
}

export interface CopyInput {
  accession_number?: string | null; // omit → auto-generated
  accession_date: string; // YYYY-MM-DD
  binding: string | null;
  source: string | null;
  bill_no: string | null;
  cost_paise: number | null;
  remarks: string | null;
  shelf_location: string | null;
}

export interface Copy {
  id: number;
  book_id: number;
  accession_number: string;
  accession_date: string;
  binding: string | null;
  source: string | null;
  bill_no: string | null;
  cost_paise: number | null;
  remarks: string | null;
  shelf_location: string | null;
  status: CopyStatus;
  last_verified_at: string | null;
}

export interface CopyWithBorrower extends Copy {
  borrower_name: string | null;
  borrower_member_code: string | null;
  loan_due_date: string | null;
}

export interface BookDetail {
  book: Book;
  copies: CopyWithBorrower[];
  loanHistory: LoanDetail[];
}

export interface MemberInput {
  name: string;
  email: string | null;
  phone: string | null;
  join_date: string;
  status: MemberStatus;
  notes: string | null;
  /** defaults to 'student' */
  member_type?: MemberType;
  /** e.g. "10" — students only */
  class_name?: string | null;
  /** e.g. "B" — students only */
  section?: string | null;
  roll_no?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  /** data URL of a photo to save; undefined = keep existing */
  photoDataUrl?: string | null;
}

export interface Member {
  id: number;
  member_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  join_date: string;
  status: MemberStatus;
  notes: string | null;
  photo_path: string | null;
  member_type: MemberType;
  class_name: string | null;
  section: string | null;
  roll_no: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
}

/** "10-B" for a student with class + section, "10" with class only, null otherwise. */
export function classLabel(m: Pick<Member, 'class_name' | 'section'>): string | null {
  if (!m.class_name) return null;
  return m.section ? `${m.class_name}-${m.section}` : m.class_name;
}

export interface MemberListRow extends Member {
  active_loans: number;
  outstanding_fines_paise: number;
  has_login: number;
}

export interface MemberDetail {
  member: Member;
  hasLogin: boolean;
  loginUsername: string | null;
  activeLoans: LoanDetail[];
  loanHistory: LoanDetail[];
  fines: FineDetail[];
}

export interface LoanDetail {
  id: number;
  copy_id: number;
  member_id: number;
  checkout_date: string;
  due_date: string;
  return_date: string | null;
  renewals_count: number;
  status: LoanStatus;
  accession_number: string;
  book_id: number;
  title: string;
  authors: string;
  member_name: string;
  member_code: string;
  /** days past due as of today (0 if not overdue); for returned loans, days late at return */
  days_overdue: number;
  /** paise accruing (active) or charged (returned) */
  accruing_fine_paise: number;
}

export interface FineDetail {
  id: number;
  loan_id: number | null;
  book_id: number | null;
  member_id: number;
  amount_paise: number;
  amount_paid_paise: number;
  reason: string | null;
  status: FineStatus;
  created_at: string;
  member_name: string;
  member_code: string;
  title: string | null;
  accession_number: string | null;
}

export interface IsbnResult {
  isbn: string;
  title: string | null;
  authors: string | null;
  publisher: string | null;
  place: string | null;
  year: number | null;
  edition: string | null;
  pages: string | null;
  subject: string | null;
  category: string | null;
  description: string | null;
  coverDataUrl: string | null;
  source: 'openlibrary' | 'googlebooks';
}

export interface ActivityRow {
  id: number;
  at: string;
  action: string;
  detail: string;
  username: string | null;
}

/** Circulation activity over one 7-day window — compared against the previous window on the dashboard. */
export interface WeekStats {
  issued: number;
  returned: number;
  newMembers: number;
  finesCollectedPaise: number;
}

export interface DashboardData {
  totals: {
    titles: number;
    copies: number;
    members: number;
    activeLoans: number;
    overdue: number;
    outstandingFinesPaise: number;
    /** fines building up on overdue loans, not yet recorded (charged at check-in) */
    accruingFinesPaise: number;
  };
  weekly: {
    /** last 7 days, oldest first, today last */
    days: { date: string; issued: number; returned: number }[];
    current: WeekStats;
    previous: WeekStats;
  };
  /** active loans due today or within the next 3 days (not yet overdue) */
  dueSoon: LoanDetail[];
  /** in-collection copies per category, largest first; the long tail folded into "Others" */
  categories: { category: string; copies: number }[];
  overdueLoans: LoanDetail[];
  popularBooks: { book_id: number; title: string; authors: string; loan_count: number }[];
  recentActivity: ActivityRow[];
}

export interface AccessionRegisterRow {
  accession_date: string;
  accession_number: string;
  authors: string;
  title: string;
  publisher: string | null;
  place: string | null;
  volume: string | null;
  edition: string | null;
  year: number | null;
  binding: string | null;
  pages: string | null;
  bill_no: string | null;
  source: string | null;
  cost_paise: number | null;
  subject: string | null;
  remarks: string | null;
  status: CopyStatus;
}

export interface OverdueReportRow extends LoanDetail {
  email: string | null;
  phone: string | null;
}

export interface FinePaymentRow {
  id: number;
  paid_at: string;
  amount_paise: number;
  note: string | null;
  member_name: string;
  member_code: string;
  title: string | null;
  recorded_by_username: string | null;
}

export interface CollectionSummaryRow {
  category: string;
  titles: number;
  copies: number;
  total_cost_paise: number;
  available: number;
  on_loan: number;
  lost: number;
  damaged: number;
  withdrawn: number;
}

export interface PopularBookRow {
  book_id: number;
  title: string;
  authors: string;
  category: string | null;
  loan_count: number;
  unique_borrowers: number;
  last_borrowed: string;
}

export interface StockSummary {
  sessionStartedAt: string | null;
  totalActive: number;
  verifiedCount: number;
  missing: (Copy & { title: string; authors: string })[];
}

export interface Paged<T> {
  rows: T[];
  total: number;
}
