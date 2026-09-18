import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowCounterClockwise,
  ArrowSquareIn,
  ArrowSquareOut,
  Barcode,
  BookOpen,
  CheckCircle,
  Eye,
  Trash,
  UserSwitch,
  Warning,
  X,
} from '@phosphor-icons/react';
import { call, formatDate, formatMoney, today } from '../../api/client';
import type { LoanDetail, MemberListRow } from '../../../shared/types';
import { classLabel } from '../../../shared/types';
import CoverThumb, { CoverLarge } from '../../components/CoverThumb';
import LoanQuickView from '../../components/LoanQuickView';
import MemberAvatar from '../../components/MemberAvatar';
import { Badge, DueChip, ErrorNote, ViewAllLink, btnPrimary, btnSecondary, tdCls, thCls } from '../../components/ui';

type Tab = 'issue' | 'return';

/** Roll/class line for a student, "Staff" for staff — the way a school librarian identifies a member. */
function memberSubline(m: Pick<MemberListRow, 'member_type' | 'class_name' | 'section' | 'roll_no'>): string {
  if (m.member_type === 'staff') return 'Staff';
  const parts = [];
  if (m.roll_no) parts.push(`Roll No ${m.roll_no}`);
  const cls = classLabel(m);
  if (cls) parts.push(`Class ${cls}`);
  return parts.join(' · ') || 'Student';
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export default function CirculationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'return' ? 'return' : 'issue';
  const setTab = (t: Tab) => setSearchParams(t === 'issue' ? {} : { tab: t });

  const { data: loans } = useQuery({
    queryKey: ['loans', 'active-quick'],
    queryFn: () => call('loans:list', { filter: 'active' }),
  });
  const out = loans?.length ?? 0;
  const dueToday = (loans ?? []).filter((l) => l.due_date === today()).length;
  const overdue = (loans ?? []).filter((l) => l.days_overdue > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Issue / Return</h1>
          <p className="mt-0.5 text-sm text-slate-500">Issue books to students and staff, or record returns and renewals.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip dot="bg-indigo-400" label={`${out} book${out === 1 ? '' : 's'} on loan`} />
          {dueToday > 0 && <StatChip dot="bg-amber-400" label={`${dueToday} due back today`} tone="amber" />}
          {overdue > 0 && <StatChip dot="bg-red-500" label={`${overdue} overdue`} tone="red" />}
        </div>
      </div>

      <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
        <div className="flex border-b border-slate-200/70 px-2">
          <TabButton active={tab === 'issue'} onClick={() => setTab('issue')} icon={<ArrowSquareOut size={17} weight="fill" />} label="Issue Book" tone="indigo" />
          <TabButton active={tab === 'return'} onClick={() => setTab('return')} icon={<ArrowSquareIn size={17} weight="fill" />} label="Return Book" tone="emerald" />
        </div>
        <div className="p-5">{tab === 'issue' ? <IssuePanel /> : <ReturnPanel />}</div>
      </section>

      <RecentTransactions />
    </div>
  );
}

function TabButton({
  active, onClick, icon, label, tone,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; tone: 'indigo' | 'emerald';
}) {
  const color = tone === 'indigo' ? 'text-indigo-600 border-indigo-600' : 'text-emerald-600 border-emerald-600';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
        active ? color : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      <span className={active ? (tone === 'indigo' ? 'text-indigo-500' : 'text-emerald-500') : 'text-slate-400'}>{icon}</span>
      {label}
    </button>
  );
}

function StatChip({ dot, label, tone }: { dot: string; label: string; tone?: 'amber' | 'red' }) {
  const cls =
    tone === 'red'
      ? 'bg-red-50 text-red-700 ring-red-600/10'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 ring-amber-600/10'
        : 'bg-white text-slate-600 ring-slate-600/10';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold shadow-sm ring-1 ring-inset ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-800">
      <span className={`text-sm font-bold ${done ? 'text-emerald-600' : 'text-indigo-600'}`}>{done ? '✓' : `${n}.`}</span>
      {title}
    </h2>
  );
}

/** Scan-first input: barcode glyph inside, Enter hint on the right. */
function ScanInput({
  value, onChange, placeholder, autoFocus, disabled, mono, inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  disabled?: boolean;
  mono?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        className={`w-full rounded-md border border-slate-300 bg-white py-2.5 pr-12 pl-3.5 text-[15px] shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15 disabled:bg-slate-50 ${mono ? 'font-mono' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
      />
      <Barcode size={18} weight="bold" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function MiniStat({ label, value, note, tone = 'slate' }: { label: string; value: string; note: string; tone?: 'slate' | 'red' | 'amber' | 'green' }) {
  const cls = {
    slate: 'border-slate-200/70 bg-white text-slate-800',
    green: 'border-emerald-200 bg-emerald-50/60 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50/60 text-amber-800',
    red: 'border-red-200 bg-red-50/60 text-red-700',
  }[tone];
  const labelCls = tone === 'slate' ? 'text-slate-500' : 'opacity-80';
  return (
    <div className={`rounded-lg border px-3 py-3 text-center ${cls}`}>
      <div className={`text-xs font-medium ${labelCls}`}>{label}</div>
      <div className="mt-0.5 text-xl font-bold tracking-tight">{value}</div>
      <div className={`text-[11px] ${labelCls}`}>{note}</div>
    </div>
  );
}

interface BasketItem {
  book_id: number;
  title: string;
  authors: string;
  accession_number: string;
}

function IssuePanel() {
  const qc = useQueryClient();
  const memberInput = useRef<HTMLInputElement>(null);
  const bookInput = useRef<HTMLInputElement>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [member, setMember] = useState<MemberListRow | null>(null);
  const [bookQuery, setBookQuery] = useState('');
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<LoanDetail[] | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data: activeLoans } = useQuery({
    queryKey: ['loans', 'active-quick'],
    queryFn: () => call('loans:list', { filter: 'active' }),
  });
  const { data: matches } = useQuery({
    queryKey: ['member-search', memberSearch],
    queryFn: () => call('members:list', { search: memberSearch }),
    enabled: memberSearch.trim().length >= 1 && !member,
  });

  const selectMember = (m: MemberListRow) => {
    setMember(m);
    setMemberSearch('');
    setError(null);
    setIssued(null);
    setTimeout(() => bookInput.current?.focus(), 0);
  };
  const clearMember = () => {
    setMember(null);
    setBasket([]);
    setError(null);
    setIssued(null);
    setTimeout(() => memberInput.current?.focus(), 0);
  };

  // Scan-first: a scanned member card types the exact member code — select instantly.
  useEffect(() => {
    if (member || !matches) return;
    const exact = matches.find((m) => m.member_code.toLowerCase() === memberSearch.trim().toLowerCase());
    if (exact) selectMember(exact);
  }, [matches, memberSearch, member]);

  const { data: bookMatches } = useQuery({
    queryKey: ['issue-book-search', bookQuery],
    queryFn: () => call('books:list', { search: bookQuery.trim(), pageSize: 6 }),
    enabled: !!member && bookQuery.trim().length >= 2,
  });

  const limit = settings?.max_books_per_member ?? 0;
  const loanDays = settings?.loan_period_days ?? 14;
  const sym = settings?.currency_symbol;
  const dueDate = addDays(today(), loanDays);
  const memberLoans = member ? (activeLoans ?? []).filter((l) => l.member_id === member.id) : [];
  const memberOverdue = memberLoans.filter((l) => l.days_overdue > 0).length;
  const blocked = member !== null && member.status !== 'active';
  const remaining = member ? Math.max(0, limit - member.active_loans - basket.length) : 0;

  const addItem = (item: BasketItem) => {
    if (basket.some((b) => b.accession_number === item.accession_number)) {
      setError(`${item.accession_number} is already in the list`);
      return;
    }
    if (limit > 0 && member && member.active_loans + basket.length >= limit) {
      setError(`Borrowing limit of ${limit} reached for ${member.name} — return a book first`);
      return;
    }
    setBasket((b) => [...b, item]);
    setError(null);
    setIssued(null);
    setBookQuery('');
    bookInput.current?.focus();
  };

  /** Resolve a scanned/typed accession number to an available copy. */
  const addByAccession = async (raw: string) => {
    const acc = raw.trim();
    if (!acc) return;
    const found = await call('books:list', { search: acc, pageSize: 5 });
    for (const row of found.rows) {
      const detail = await call('books:get', { id: row.id });
      const copy = detail.copies.find((c) => c.accession_number.toLowerCase() === acc.toLowerCase());
      if (!copy) continue;
      if (copy.status !== 'available') {
        setError(`Copy ${copy.accession_number} is not available (${copy.status.replace('_', ' ')})`);
        return;
      }
      addItem({ book_id: row.id, title: row.title, authors: row.authors, accession_number: copy.accession_number });
      return;
    }
    setError(`No copy found with accession number "${acc}" — try searching by title instead`);
  };

  /** Pick a title from search: take its first available copy that isn't already listed. */
  const pickBook = async (bookId: number) => {
    const detail = await call('books:get', { id: bookId });
    const copy = detail.copies.find(
      (c) => c.status === 'available' && !basket.some((b) => b.accession_number === c.accession_number),
    );
    if (!copy) {
      setError('No more available copies of that title');
      return;
    }
    addItem({ book_id: bookId, title: detail.book.title, authors: detail.book.authors, accession_number: copy.accession_number });
  };

  const issueAll = async () => {
    if (!member || basket.length === 0) return;
    setBusy(true);
    const done: LoanDetail[] = [];
    const failed: string[] = [];
    for (const item of basket) {
      try {
        done.push(await call('circ:checkout', { accessionNumber: item.accession_number, memberId: member.id }));
      } catch (e) {
        failed.push(`${item.accession_number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(false);
    qc.invalidateQueries();
    setBasket(basket.filter((b) => failed.some((f) => f.startsWith(b.accession_number))));
    setIssued(done.length ? done : null);
    setError(failed.length ? failed.join('\n') : null);
    const rows = await call('members:list', { search: member.member_code });
    const updated = rows.find((r) => r.id === member.id);
    if (updated) setMember(updated);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-12">
        {/* ---- 1. member ---- */}
        <div className="lg:col-span-5">
          <StepTitle n={1} title="Select Member" done={!!member} />
          {!member ? (
            <>
              <ScanInput
                inputRef={memberInput}
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder="Scan card, or search by name, roll no or ID…"
                autoFocus
              />
              {matches && matches.length > 0 && memberSearch.trim() ? (
                <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 shadow-sm">
                  {matches.slice(0, 8).map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-indigo-50"
                        onClick={() => selectMember(m)}
                      >
                        <MemberAvatar memberId={m.id} name={m.name} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{m.name}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {memberSubline(m)} <span className="font-mono text-slate-400">· {m.member_code}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                          {m.active_loans > 0 && <span>{m.active_loans} out</span>}
                          {m.outstanding_fines_paise > 0 && (
                            <span className="font-semibold text-red-500">{formatMoney(m.outstanding_fines_paise, sym)}</span>
                          )}
                          <Badge value={m.status} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center">
                  <UserSwitch size={26} weight="duotone" className="text-slate-300" />
                  <p className="text-sm text-slate-400">Scan the member's card or start typing a name.</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className={`rounded-lg border p-4 shadow-sm ${blocked ? 'border-red-200 bg-red-50/40' : 'border-slate-200/70 bg-white'}`}>
                <div className="flex items-start gap-4">
                  <MemberAvatar memberId={member.id} name={member.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/members/${member.id}`} className="truncate text-[17px] font-bold text-slate-800 hover:text-indigo-600 hover:underline">
                        {member.name}
                      </Link>
                      <Badge value={member.status} />
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600">{memberSubline(member)}</div>
                    <div className="mt-0.5 font-mono text-xs text-slate-400">{member.member_code}</div>
                  </div>
                  <button
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-400 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                    title="Change member"
                    onClick={clearMember}
                  >
                    <X size={15} weight="bold" />
                  </button>
                </div>
                {blocked && (
                  <p className="mt-3 flex items-center gap-1 text-xs font-semibold text-red-600">
                    <Warning size={13} weight="fill" /> This member is {member.status} and cannot borrow.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat
                  label="Books issued"
                  value={limit > 0 ? `${member.active_loans} / ${limit}` : String(member.active_loans)}
                  note={limit > 0 ? (remaining === 0 ? 'Limit reached' : `${remaining} more allowed${basket.length ? ' after this' : ''}`) : 'No limit'}
                  tone={limit > 0 && member.active_loans >= limit ? 'red' : 'slate'}
                />
                <MiniStat
                  label="Overdue books"
                  value={String(memberOverdue)}
                  note={memberOverdue > 0 ? 'Return first' : 'None'}
                  tone={memberOverdue > 0 ? 'amber' : 'slate'}
                />
                <MiniStat
                  label="Fine pending"
                  value={formatMoney(member.outstanding_fines_paise, sym)}
                  note={member.outstanding_fines_paise > 0 ? 'Unpaid' : 'No dues'}
                  tone={member.outstanding_fines_paise > 0 ? 'red' : 'slate'}
                />
              </div>
            </div>
          )}
        </div>

        {/* ---- 2. books ---- */}
        <div className={`lg:col-span-7 ${!member ? 'opacity-50' : ''}`}>
          <StepTitle n={2} title="Add Book(s)" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (bookQuery.trim()) addByAccession(bookQuery);
            }}
          >
            <ScanInput
              inputRef={bookInput}
              value={bookQuery}
              onChange={(v) => { setBookQuery(v); setError(null); }}
              placeholder="Scan book label, or search by title / author / ISBN…"
              disabled={!member || blocked}
            />
          </form>
          {member && bookMatches && bookMatches.rows.length > 0 && bookQuery.trim().length >= 2 && (
            <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 shadow-sm">
              {bookMatches.rows.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                    disabled={b.available_copies === 0}
                    onClick={() => pickBook(b.id)}
                    title={b.available_copies === 0 ? 'No copies available' : 'Add an available copy of this title'}
                  >
                    <CoverThumb bookId={b.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.title}</span>
                      <span className="block truncate text-xs text-slate-500">{b.authors}</span>
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${b.available_copies > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {b.available_copies > 0 ? `${b.available_copies} available` : 'All out'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200/70">
            {basket.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-9 text-center">
                <BookOpen size={26} weight="duotone" className="text-slate-300" />
                <p className="text-sm text-slate-400">
                  {member ? 'Scan a book label or search a title to add it to the list.' : 'Select a member first.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>Book</th>
                    <th className={thCls}>Accession No</th>
                    <th className={thCls}>Due date</th>
                    <th className={`${thCls} text-right`}>Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {basket.map((b) => (
                    <tr key={b.accession_number}>
                      <td className={tdCls}>
                        <div className="flex items-center gap-3">
                          <CoverThumb bookId={b.book_id} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-800">{b.title}</div>
                            <div className="truncate text-xs text-slate-500">{b.authors}</div>
                          </div>
                        </div>
                      </td>
                      <td className={`${tdCls} font-mono text-slate-600`}>{b.accession_number}</td>
                      <td className={tdCls}>
                        <div className="text-slate-800">{formatDate(dueDate)}</div>
                        <div className="text-xs text-emerald-600">({loanDays} days)</div>
                      </td>
                      <td className={`${tdCls} text-right`}>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-600 transition hover:bg-red-100"
                          title="Remove from list"
                          onClick={() => setBasket((list) => list.filter((x) => x.accession_number !== b.accession_number))}
                        >
                          <Trash size={14} weight="bold" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50/80 text-sm">
                    <td className={`${tdCls} font-semibold text-slate-700`} colSpan={2}>
                      Total books: {basket.length}
                      {limit > 0 && <span className="ml-2 font-normal text-slate-400">({remaining} more allowed)</span>}
                    </td>
                    <td className={`${tdCls} font-semibold text-indigo-700`} colSpan={2}>
                      Due date: {formatDate(dueDate)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ---- outcome + actions ---- */}
      {error && <ErrorNote error={error} />}
      {issued && issued.length > 0 && (
        <div className="animate-rise flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-3 shadow-sm">
          <div className="flex -space-x-2">
            {issued.slice(0, 4).map((l) => (
              <CoverLarge key={l.id} bookId={l.book_id} className="h-12 w-9 rounded shadow-sm ring-2 ring-white" />
            ))}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <CheckCircle size={15} weight="fill" /> Issued {issued.length} book{issued.length === 1 ? '' : 's'} to {issued[0].member_name}
            </div>
            <div className="truncate text-slate-600">
              {issued.map((l) => l.title).join(' · ')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-bold tracking-wider text-emerald-600/70 uppercase">Due back</div>
            <div className="text-sm font-bold text-emerald-800">{formatDate(issued[0].due_date)}</div>
          </div>
          <button className={`${btnSecondary} shrink-0`} onClick={clearMember}>
            <UserSwitch size={15} weight="bold" /> Next member
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {member && member.outstanding_fines_paise > 0 && !blocked && (
          <span className="mr-auto flex items-center gap-1 text-xs font-semibold text-amber-700">
            <Warning size={13} weight="fill" /> {formatMoney(member.outstanding_fines_paise, sym)} in fines is still unpaid.
          </span>
        )}
        <button className={btnSecondary} onClick={() => { setBasket([]); setError(null); setIssued(null); }} disabled={basket.length === 0}>
          Clear
        </button>
        <button className={`${btnPrimary} px-5`} onClick={issueAll} disabled={busy || !member || blocked || basket.length === 0}>
          <ArrowSquareOut size={15} weight="fill" />
          {busy ? 'Issuing…' : `Issue ${basket.length || ''} Book${basket.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function ReturnPanel() {
  const qc = useQueryClient();
  const [accession, setAccession] = useState('');
  const [picked, setPicked] = useState('');
  const [result, setResult] = useState<{ loan: LoanDetail; finePaise: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });

  // Scan OR search: typing filters the currently-out loans by title, member or accession.
  const { data: activeLoans } = useQuery({
    queryKey: ['loans', 'active-quick'],
    queryFn: () => call('loans:list', { filter: 'active' }),
  });
  const q = accession.trim().toLowerCase();
  const loanMatches =
    q.length >= 2 && accession !== picked
      ? (activeLoans ?? [])
          .filter(
            (l) =>
              l.title.toLowerCase().includes(q) ||
              l.member_name.toLowerCase().includes(q) ||
              l.accession_number.toLowerCase().includes(q),
          )
          .slice(0, 6)
      : [];

  const checkin = useMutation({
    mutationFn: (acc: string) => call('circ:checkin', { accessionNumber: acc }),
    onSuccess: (res) => {
      setResult(res);
      setError(null);
      setAccession('');
      qc.invalidateQueries();
    },
    onError: (e) => {
      setError(e.message);
      setResult(null);
    },
  });
  const renew = useMutation({
    mutationFn: (loanId: number) => call('circ:renew', { loanId }),
    onSuccess: () => { setError(null); qc.invalidateQueries(); },
    onError: (e) => setError(e.message),
  });
  const unrenew = useMutation({
    mutationFn: (loanId: number) => call('circ:unrenew', { loanId }),
    onSuccess: () => { setError(null); qc.invalidateQueries(); },
    onError: (e) => setError(e.message),
  });

  const fined = result !== null && result.finePaise > 0;

  return (
    <div className="space-y-5">
      <div>
        <StepTitle n={1} title="Scan the returning book" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (accession.trim()) checkin.mutate(accession.trim());
          }}
          className="flex gap-2"
        >
          <ScanInput value={accession} onChange={setAccession} placeholder="Scan book label, or search title / member…" mono autoFocus />
          <button className={`${btnPrimary} shrink-0 px-5`} disabled={checkin.isPending || !accession.trim()}>
            <ArrowSquareIn size={15} weight="fill" /> Return
          </button>
        </form>
        {loanMatches.length > 0 && (
          <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 shadow-sm">
            {loanMatches.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-indigo-50"
                  onClick={() => { setPicked(l.accession_number); setAccession(l.accession_number); setError(null); }}
                  title="Fill in this copy's accession number"
                >
                  <CoverThumb bookId={l.book_id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {l.title} <span className="font-normal text-slate-500">→ {l.member_name}</span>
                    </span>
                    <span className="font-mono text-xs text-slate-400">{l.accession_number}</span>
                  </span>
                  <DueChip loan={l} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <ErrorNote error={error} />}
      {result && (
        <div
          className={`animate-rise flex items-center gap-3 rounded-lg border p-3 shadow-sm ${
            fined ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-white' : 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-white'
          }`}
        >
          <CoverLarge bookId={result.loan.book_id} className="h-14 w-10 shrink-0 rounded shadow-sm ring-1 ring-slate-900/10" />
          <div className="min-w-0 flex-1 text-sm">
            <div className={`flex items-center gap-1.5 font-semibold ${fined ? 'text-amber-800' : 'text-emerald-800'}`}>
              <CheckCircle size={15} weight="fill" /> Returned by {result.loan.member_name}
            </div>
            <div className="truncate text-slate-600">
              {result.loan.title} <span className="font-mono text-xs text-slate-400">{result.loan.accession_number}</span>
            </div>
            {fined && (
              <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-800">
                <Warning size={13} weight="fill" /> {result.loan.days_overdue} day(s) late — fine of{' '}
                {formatMoney(result.finePaise, settings?.currency_symbol)} recorded
              </div>
            )}
          </div>
        </div>
      )}

      <CurrentlyOutTable
        loans={activeLoans ?? []}
        maxRenewals={settings?.max_renewals}
        onReturn={(acc) => checkin.mutate(acc)}
        onRenew={(id) => renew.mutate(id)}
        onUnrenew={(id) => unrenew.mutate(id)}
      />
    </div>
  );
}

function CurrentlyOutTable({
  loans, maxRenewals, onReturn, onRenew, onUnrenew,
}: {
  loans: LoanDetail[];
  maxRenewals?: number;
  onReturn: (accession: string) => void;
  onRenew: (loanId: number) => void;
  onUnrenew: (loanId: number) => void;
}) {
  const [quickView, setQuickView] = useState<number | null>(null);
  const { data: members } = useQuery({ queryKey: ['members'], queryFn: () => call('members:list', {}) });
  const memberById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);
  const sorted = useMemo(() => [...loans].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id), [loans]);
  const open = quickView !== null ? loans.find((l) => l.id === quickView) : undefined;

  return (
    <div>
      <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Currently out ({loans.length})</h3>
      {loans.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-slate-200 py-8 text-center">
          <BookOpen size={28} weight="duotone" className="text-slate-300" />
          <p className="text-sm text-slate-400">Every book is on the shelf — nothing is out right now.</p>
        </div>
      ) : (
        <div className="max-h-[26rem] overflow-y-auto rounded-lg border border-slate-200/70">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={thCls}>Book</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Due</th>
                <th className={thCls}>Renewals</th>
                <th className={`${thCls} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
              {sorted.map((l) => {
                const m = memberById.get(l.member_id);
                const renewMaxed = maxRenewals !== undefined && l.renewals_count >= maxRenewals;
                return (
                  <tr key={l.id} className="cursor-pointer" onClick={() => setQuickView(l.id)} title="Click for loan details">
                    <td className={tdCls}>
                      <div className="flex items-center gap-2.5">
                        <CoverThumb bookId={l.book_id} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800">{l.title}</div>
                          <div className="font-mono text-xs text-slate-400">{l.accession_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <div className="text-slate-800">{l.member_name}</div>
                      <div className="text-xs text-slate-500">{m ? memberSubline(m) : l.member_code}</div>
                    </td>
                    <td className={tdCls}><DueChip loan={l} /></td>
                    <td className={`${tdCls} text-slate-600 tabular-nums`}>
                      {l.renewals_count}{maxRenewals !== undefined && ` / ${maxRenewals}`}
                    </td>
                    <td className={`${tdCls} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                          onClick={() => onRenew(l.id)}
                          disabled={renewMaxed}
                          title={renewMaxed ? 'Renewal limit reached' : 'Renew this loan'}
                        >
                          Renew
                        </button>
                        {l.renewals_count > 0 && (
                          <button
                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            onClick={() => onUnrenew(l.id)}
                            title="Undo one renewal (rolls the due date back)"
                          >
                            <ArrowCounterClockwise size={13} weight="bold" />
                          </button>
                        )}
                        <button
                          className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          onClick={() => onReturn(l.accession_number)}
                          title="Return this copy now"
                        >
                          Return
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <LoanQuickView loan={open} onClose={() => setQuickView(null)} />}
    </div>
  );
}

/** Today's issues and returns, newest first — the librarian's running log for the day. */
function RecentTransactions() {
  const { data: loans } = useQuery({ queryKey: ['loans', 'all'], queryFn: () => call('loans:list', { filter: 'all' }) });
  const { data: members } = useQuery({ queryKey: ['members'], queryFn: () => call('members:list', {}) });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const memberById = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);
  const [quickView, setQuickView] = useState<LoanDetail | null>(null);

  const events = useMemo(() => {
    const t = today();
    const list: { key: string; type: 'issued' | 'returned'; loan: LoanDetail }[] = [];
    for (const l of loans ?? []) {
      if (l.return_date === t) list.push({ key: `r${l.id}`, type: 'returned', loan: l });
      if (l.checkout_date === t) list.push({ key: `i${l.id}`, type: 'issued', loan: l });
    }
    // Returns of older loans land after today's issues in id order, so sort returns first, then newest id.
    return list.sort((a, b) => (a.type === b.type ? b.loan.id - a.loan.id : a.type === 'returned' ? -1 : 1)).slice(0, 10);
  }, [loans]);

  return (
    <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="text-[15px] font-semibold text-slate-800">
          Today's Transactions <span className="ml-1 font-normal text-slate-400">({events.length})</span>
        </h2>
        <ViewAllLink to="/loans">View all loans</ViewAllLink>
      </div>
      {events.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-400">No books issued or returned yet today.</p>
      ) : (
        <div className="overflow-x-auto border-t border-slate-200/70">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Type</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Book</th>
                <th className={thCls}>Date</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
              {events.map(({ key, type, loan: l }) => {
                const m = memberById.get(l.member_id);
                const late = type === 'returned' && l.days_overdue > 0;
                return (
                  <tr key={key}>
                    <td className={tdCls}>
                      <span className="inline-flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${type === 'issued' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {type === 'issued' ? <ArrowSquareOut size={14} weight="fill" /> : <ArrowSquareIn size={14} weight="fill" />}
                        </span>
                        <span className="font-medium text-slate-700">{type === 'issued' ? 'Issued' : 'Returned'}</span>
                      </span>
                    </td>
                    <td className={tdCls}>
                      <Link to={`/members/${l.member_id}`} className="font-semibold text-slate-800 hover:text-indigo-600 hover:underline">
                        {l.member_name}
                      </Link>
                      <div className="text-xs text-slate-500">{m ? memberSubline(m) : l.member_code}</div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2.5">
                        <CoverThumb bookId={l.book_id} />
                        <div className="min-w-0">
                          <Link to={`/catalog/${l.book_id}`} className="block truncate text-slate-800 hover:text-indigo-600 hover:underline">
                            {l.title}
                          </Link>
                          <div className="font-mono text-xs text-slate-400">{l.accession_number}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-slate-600`}>
                      {type === 'issued' ? (
                        <>Due {formatDate(l.due_date)}</>
                      ) : (
                        <>Issued {formatDate(l.checkout_date)}</>
                      )}
                    </td>
                    <td className={tdCls}>
                      {type === 'issued' ? (
                        <Badge value="active" />
                      ) : late ? (
                        <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-600/10 ring-inset">
                          {l.days_overdue}d late · {formatMoney(l.accruing_fine_paise, settings?.currency_symbol)}
                        </span>
                      ) : (
                        <Badge value="returned" />
                      )}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100"
                        title="Loan details"
                        onClick={() => setQuickView(l)}
                      >
                        <Eye size={14} weight="bold" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {quickView && <LoanQuickView loan={quickView} onClose={() => setQuickView(null)} />}
    </section>
  );
}
