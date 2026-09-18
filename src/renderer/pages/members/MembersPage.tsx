import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { Icon } from '@phosphor-icons/react';
import {
  CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, ChalkboardTeacher, DownloadSimple, Eye, Key,
  MagnifyingGlass, PencilSimple, Student, Trash, UserMinus, UserPlus, UsersThree,
} from '@phosphor-icons/react';
import MemberQuickView from '../../components/MemberQuickView';
import { call, formatDate, formatMoney, today } from '../../api/client';
import { MEMBER_IMPORT_TEMPLATE_HEADERS, classLabel } from '../../../shared/types';
import type { MemberInput, MemberListRow, MemberType } from '../../../shared/types';
import { ImportCsvButton } from '../../components/ImportCsvModal';
import MemberAvatar from '../../components/MemberAvatar';
import {
  Badge, EmptyState, ErrorNote, Field, Modal, StatCard,
  btnPrimary, btnSecondary, inputCls, tdCls, thCls,
} from '../../components/ui';

const emptyMember = (): MemberInput => ({
  name: '',
  email: null,
  phone: null,
  join_date: today(),
  status: 'active',
  notes: null,
  member_type: 'student',
  class_name: null,
  section: null,
  roll_no: null,
  guardian_name: null,
  guardian_phone: null,
});

/** Status filter carried in the URL — `inactive` = suspended + expired. */
type StatusFilter = 'all' | 'active' | 'inactive' | 'suspended' | 'expired';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All statuses' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive (suspended + expired)' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'expired', label: 'Expired' },
];
type TypeFilter = 'all' | MemberType;

type SortKey = 'member_code' | 'name' | 'class' | 'status' | 'join_date' | 'active_loans' | 'outstanding_fines_paise';
const PAGE_SIZES = [10, 25, 50, 100];

/** Inputs without Tailwind's w-full so they size to their content inside toolbars. */
const compactInput = inputCls.replace('w-full ', '');

/** Sort classes numerically (9 before 10), then by section, then roll number. */
function classSortKey(m: MemberListRow): string {
  if (m.member_type === 'staff') return 'zzz-staff';
  const cls = (m.class_name ?? '').padStart(4, '0');
  const roll = (m.roll_no ?? '').padStart(5, '0');
  return `${cls}-${m.section ?? ''}-${roll}`;
}

function SortHeader({
  label, k, sort, onSort, align = 'left',
}: {
  label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = sort.key === k;
  const Arrow: Icon = active ? (sort.dir === 'asc' ? CaretUp : CaretDown) : CaretUpDown;
  return (
    <th className={`${thCls} ${align === 'right' ? 'text-right' : ''}`}>
      <button
        className={`inline-flex items-center gap-1 uppercase transition hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}
        onClick={() => onSort(k)}
      >
        {label}
        <Arrow size={12} weight="bold" className={active ? 'text-indigo-600' : 'text-slate-300'} />
      </button>
    </th>
  );
}

export default function MembersPage() {
  const qc = useQueryClient();
  // Type + status filters live in the URL so the stat tiles (and other pages) can deep-link,
  // e.g. /members?type=student&status=inactive.
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') as StatusFilter | null;
  const status: StatusFilter = statusParam && STATUS_FILTERS.some((f) => f.key === statusParam) ? statusParam : 'all';
  const typeParam = searchParams.get('type');
  const type: TypeFilter = typeParam === 'student' || typeParam === 'staff' ? typeParam : 'all';
  const setFilters = (patch: { status?: StatusFilter; type?: TypeFilter }) => {
    const next: Record<string, string> = {};
    const s = patch.status ?? status;
    const t = patch.type ?? type;
    if (s !== 'all') next.status = s;
    if (t !== 'all') next.type = t;
    setSearchParams(next);
    setPage(1);
  };

  const [search, setSearch] = useState('');
  const [klass, setKlass] = useState(''); // "" = all classes; otherwise a classLabel like "10-B"
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'class', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MemberListRow | null>(null);
  const [quickView, setQuickView] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // One fetch for everything on the page; search/filter/sort/paging happen client-side so the
  // stat tiles always reflect the whole membership, not the current filter.
  const { data: all, isLoading } = useQuery({ queryKey: ['members'], queryFn: () => call('members:list', {}) });

  const del = useMutation({
    mutationFn: (id: number) => call('members:delete', { id }),
    onSuccess: () => { setActionError(null); qc.invalidateQueries(); },
    onError: (e) => setActionError(e.message),
  });

  const stats = useMemo(() => {
    const rows = all ?? [];
    const total = rows.length;
    const students = rows.filter((m) => m.member_type === 'student').length;
    const staff = total - students;
    const inactive = rows.filter((m) => m.status !== 'active').length;
    const classes = new Set(rows.map((m) => (m.member_type === 'student' ? classLabel(m) : null)).filter(Boolean)).size;
    return { total, students, staff, inactive, classes };
  }, [all]);

  const classOptions = useMemo(() => {
    const seen = new Map<string, MemberListRow>();
    for (const m of all ?? []) {
      const c = m.member_type === 'student' ? classLabel(m) : null;
      if (c && !seen.has(c)) seen.set(c, m);
    }
    return [...seen.entries()].sort(([, a], [, b]) => classSortKey(a).localeCompare(classSortKey(b))).map(([c]) => c);
  }, [all]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = (all ?? []).filter((m) => {
      if (type !== 'all' && m.member_type !== type) return false;
      if (status === 'inactive' ? m.status === 'active' : status !== 'all' && m.status !== status) return false;
      if (klass && classLabel(m) !== klass) return false;
      if (!q) return true;
      const hay = [m.name, m.member_code, m.email, m.phone, m.guardian_phone, m.guardian_name, m.roll_no, classLabel(m)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (m: MemberListRow) => (sort.key === 'class' ? classSortKey(m) : m[sort.key]);
    return rows.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return cmp * dir || a.member_code.localeCompare(b.member_code, undefined, { numeric: true });
    });
  }, [all, type, status, klass, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const onSort = (k: SortKey) => {
    const descFirst: SortKey[] = ['join_date', 'active_loans', 'outstanding_fines_paise'];
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: descFirst.includes(k) ? 'desc' : 'asc' }));
    setPage(1);
  };

  const exportCsv = async () => {
    const res = await call('reports:exportCsv', {
      filename: `members${klass ? `-class-${klass}` : type !== 'all' ? `-${type}` : ''}-${today()}.csv`,
      headers: ['Member ID', 'Name', 'Type', 'Class', 'Section', 'Roll no', 'Guardian', 'Guardian phone', 'Phone', 'Email', 'Status', 'Joined', 'Books out', 'Fines due', 'OPAC login', 'Notes'],
      rows: filtered.map((m) => [
        m.member_code, m.name, m.member_type, m.class_name, m.section, m.roll_no, m.guardian_name, m.guardian_phone,
        m.phone, m.email, m.status, m.join_date, m.active_loans,
        m.outstanding_fines_paise ? (m.outstanding_fines_paise / 100).toFixed(2) : null,
        m.has_login ? 'yes' : 'no', m.notes,
      ]),
    });
    setSavedMsg(res.savedPath ? `Saved ${filtered.length} member${filtered.length === 1 ? '' : 's'} to ${res.savedPath}` : null);
  };

  const heading =
    klass ? `Class ${klass}` : type === 'student' ? 'Students' : type === 'staff' ? 'Staff' : 'All Members';
  const statusNote = status === 'all' ? '' : ` · ${STATUS_FILTERS.find((f) => f.key === status)?.label.replace(/ \(.*\)/, '')}`;

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="mt-0.5 text-sm text-slate-500">Students and staff who can borrow from the library.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} w-72 pl-9`}
              placeholder="Search name, ID, class, roll no…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <ImportCsvButton
            title="Import members from CSV"
            description={
              <>
                One row per member. Only <b>name</b> is required; blank member codes are assigned
                automatically. <b>member_type</b> is <i>student</i> (default) or <i>staff</i>; students may
                carry <b>class</b>, <b>section</b>, <b>roll_no</b> and guardian details. Fill <b>username</b> and{' '}
                <b>password</b> to also create an OPAC login — they must set their own password at first sign-in.
              </>
            }
            templateFilename="members-import-template.csv"
            templateHeaders={MEMBER_IMPORT_TEMPLATE_HEADERS}
            templateRows={[
              ['Asha Nair', '', 'student', '10', 'B', '12', 'Suresh Nair', '9876543210', '', '', '2026-06-01', 'active', '', 'asha.n', 'welcome1'],
              ['Rahul Menon', 'STU-2026-042', 'student', '9', 'A', '7', '', '', '', '', '', '', 'Transferred in 2026', '', ''],
              ['Priya Thomas', '', 'staff', '', '', '', '', '', 'priya@school.edu', '9000000000', '', '', 'Class teacher 8B', '', ''],
            ]}
            run={(csvText, dryRun) => call('import:membersCsv', { csvText, dryRun })}
            primaryNoun={['member', 'members']}
            secondaryNoun={['login', 'logins']}
          />
          <button className={btnPrimary} onClick={() => setAdding(true)}>
            <UserPlus size={16} weight="fill" /> Add Member
          </button>
        </div>
      </div>

      {/* ---- stat tiles (each links to the matching filter) ---- */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total members" value={stats.total} icon={<UsersThree size={22} weight="fill" />} tone="indigo" to="/members" />
        <StatCard
          label="Students"
          value={stats.students}
          icon={<Student size={22} weight="fill" />}
          tone="sky"
          to="/members?type=student"
          sub={stats.classes > 0 ? `${stats.classes} class${stats.classes === 1 ? '' : 'es'}` : undefined}
        />
        <StatCard label="Staff" value={stats.staff} icon={<ChalkboardTeacher size={22} weight="fill" />} tone="green" to="/members?type=staff" />
        <StatCard
          label="Inactive members"
          value={stats.inactive}
          icon={<UserMinus size={22} weight="fill" />}
          tone={stats.inactive > 0 ? 'amber' : 'slate'}
          to="/members?status=inactive"
          sub={stats.total ? `${Math.round((stats.inactive / stats.total) * 100)}% of total` : undefined}
          subTone={stats.inactive > 0 ? 'amber' : 'slate'}
          subTitle="Suspended or expired memberships"
        />
      </div>

      {/* ---- table card ---- */}
      <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-slate-800">
            {heading}
            <span className="font-normal text-slate-500">{statusNote}</span>
            <span className="ml-1.5 font-normal text-slate-400">({filtered.length.toLocaleString()})</span>
            {q && <span className="ml-2 text-sm font-normal text-slate-400">matching “{search.trim()}”</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select className={compactInput} value={type} onChange={(e) => setFilters({ type: e.target.value as TypeFilter })}>
              <option value="all">Students & staff</option>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
            </select>
            {classOptions.length > 0 && type !== 'staff' && (
              <select className={compactInput} value={klass} onChange={(e) => { setKlass(e.target.value); setPage(1); }}>
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c} value={c}>Class {c}</option>
                ))}
              </select>
            )}
            <select className={compactInput} value={status} onChange={(e) => setFilters({ status: e.target.value as StatusFilter })}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <button className={btnSecondary} onClick={exportCsv} disabled={filtered.length === 0} title="Export the members currently listed">
              <DownloadSimple size={15} weight="bold" /> Export CSV
            </button>
          </div>
        </div>
        {(savedMsg || actionError) && (
          <div className="px-5 pb-3">
            {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
            {actionError && <ErrorNote error={actionError} />}
          </div>
        )}

        {isLoading ? (
          <div className="px-5 pb-6 text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message={q ? `No members match “${search.trim()}”` : all?.length ? 'No members in this filter' : 'No members yet — add the first student or staff member'} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border-t border-slate-200/70">
              <table className="w-full divide-y divide-slate-200 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-50/40">
                <thead>
                  <tr>
                    <SortHeader label="Member ID" k="member_code" sort={sort} onSort={onSort} />
                    <SortHeader label="Name" k="name" sort={sort} onSort={onSort} />
                    <SortHeader label="Class" k="class" sort={sort} onSort={onSort} />
                    <th className={thCls}>Contact</th>
                    <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
                    <SortHeader label="Joined" k="join_date" sort={sort} onSort={onSort} />
                    <SortHeader label="Books out" k="active_loans" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label="Fines due" k="outstanding_fines_paise" sort={sort} onSort={onSort} align="right" />
                    <th className={`${thCls} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.map((m) => {
                    const isStudent = m.member_type === 'student';
                    const cls = classLabel(m);
                    return (
                      <tr key={m.id} className="group cursor-pointer" onClick={() => setQuickView(m.id)} title="Click for quick view">
                        <td className={`${tdCls} border-l-2 border-transparent group-hover:border-indigo-400`}>
                          <Link
                            to={`/members/${m.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono text-[13px] font-semibold text-indigo-600 hover:underline"
                          >
                            {m.member_code}
                          </Link>
                        </td>
                        <td className={tdCls}>
                          <div className="flex items-center gap-3">
                            <MemberAvatar memberId={m.id} name={m.name} size={34} />
                            <div className="min-w-0">
                              <Link
                                to={`/members/${m.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block truncate font-semibold text-slate-800 hover:underline group-hover:text-indigo-600"
                              >
                                {m.name}
                              </Link>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                {isStudent ? (m.roll_no ? `Roll no ${m.roll_no}` : 'Student') : 'Staff member'}
                                {m.has_login ? (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-600" title="Has an OPAC login">
                                    <Key size={11} weight="fill" /> login
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={tdCls}>
                          {isStudent ? (
                            cls ? (
                              <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-600/10 ring-inset">
                                {cls}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-300">not set</span>
                            )
                          ) : (
                            <Badge value="staff" />
                          )}
                        </td>
                        <td className={`${tdCls} max-w-60`}>
                          {isStudent && m.guardian_phone ? (
                            <div className="text-sm text-slate-700 tabular-nums" title={m.guardian_name ? `Guardian: ${m.guardian_name}` : 'Guardian phone'}>
                              {m.guardian_phone}
                              <span className="ml-1.5 text-xs text-slate-400">{m.guardian_name ? m.guardian_name.split(' ')[0] : 'guardian'}</span>
                            </div>
                          ) : m.phone ? (
                            <div className="text-sm text-slate-700 tabular-nums">{m.phone}</div>
                          ) : null}
                          {m.email && (
                            <div className="truncate text-xs text-slate-400" title={m.email}>{m.email}</div>
                          )}
                          {!m.phone && !m.guardian_phone && !m.email && <span className="text-slate-300">—</span>}
                        </td>
                        <td className={tdCls}><Badge value={m.status} /></td>
                        <td className={`${tdCls} whitespace-nowrap text-slate-600`}>{formatDate(m.join_date)}</td>
                        <td className={`${tdCls} text-right`}>
                          {m.active_loans > 0 ? (
                            <span className="inline-flex items-center rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-600/10 ring-inset">
                              {m.active_loans}
                            </span>
                          ) : (
                            <span className="text-slate-300">0</span>
                          )}
                        </td>
                        <td className={`${tdCls} text-right`}>
                          {m.outstanding_fines_paise > 0 ? (
                            <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-600/10 ring-inset">
                              {formatMoney(m.outstanding_fines_paise)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className={`${tdCls} w-28`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <RowAction title="Quick view" icon={Eye} tone="indigo" onClick={() => setQuickView(m.id)} />
                            <RowAction title="Edit" icon={PencilSimple} tone="sky" onClick={() => setEditing(m)} />
                            <RowAction
                              title={m.active_loans > 0 ? 'Cannot delete — member has books on loan' : 'Delete member'}
                              icon={Trash}
                              tone="red"
                              disabled={m.active_loans > 0 || del.isPending}
                              onClick={() => { if (confirm(`Delete member ${m.name} (${m.member_code})? This cannot be undone.`)) del.mutate(m.id); }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ---- footer: paging ---- */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-5 py-3 text-sm text-slate-500">
              <span>
                Showing {start + 1}–{Math.min(start + pageSize, filtered.length)} of {filtered.length.toLocaleString()} member{filtered.length === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <select
                  className={`${compactInput} py-1.5`}
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <button className={`${btnSecondary} px-2.5`} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                  <CaretLeft size={15} weight="bold" />
                </button>
                <span className="whitespace-nowrap tabular-nums">Page {safePage} of {totalPages}</span>
                <button className={`${btnSecondary} px-2.5`} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                  <CaretRight size={15} weight="bold" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {quickView !== null && <MemberQuickView memberId={quickView} onClose={() => setQuickView(null)} />}
      {adding && (
        <MemberFormModal
          title="Add member"
          initial={emptyMember()}
          onClose={() => setAdding(false)}
          onSave={async (m) => {
            await call('members:create', { member: m });
            qc.invalidateQueries({ queryKey: ['members'] });
            setAdding(false);
          }}
        />
      )}
      {editing && (
        <MemberFormModal
          title="Edit member"
          initial={{
            name: editing.name,
            email: editing.email,
            phone: editing.phone,
            join_date: editing.join_date,
            status: editing.status,
            notes: editing.notes,
            member_type: editing.member_type,
            class_name: editing.class_name,
            section: editing.section,
            roll_no: editing.roll_no,
            guardian_name: editing.guardian_name,
            guardian_phone: editing.guardian_phone,
          }}
          onClose={() => setEditing(null)}
          onSave={async (m) => {
            await call('members:update', { id: editing.id, member: m });
            qc.invalidateQueries();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

const rowActionTones = {
  indigo: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
  sky: 'bg-sky-50 text-sky-600 hover:bg-sky-100',
  red: 'bg-red-50 text-red-600 hover:bg-red-100',
};

function RowAction({
  title, icon: I, tone, onClick, disabled,
}: {
  title: string; icon: Icon; tone: keyof typeof rowActionTones; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-35 ${rowActionTones[tone]}`}
    >
      <I size={14} weight="bold" />
    </button>
  );
}

/** Add/Edit member form. Also used by the member detail page. */
export function MemberFormModal({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial: MemberInput;
  onClose: () => void;
  onSave: (m: MemberInput) => Promise<void>;
}) {
  const [member, setMember] = useState<MemberInput>({ member_type: 'student', ...initial });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => onSave(member),
    onError: (e) => setError(e.message),
  });
  const set = (patch: Partial<MemberInput>) => setMember((m) => ({ ...m, ...patch }));
  const isStudent = (member.member_type ?? 'student') === 'student';

  const onPhotoPick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo is too large (max 2 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ photoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const typeBtn = (t: MemberType, label: string, I: Icon) => (
    <button
      type="button"
      onClick={() => set({ member_type: t })}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
        (member.member_type ?? 'student') === t ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25' : 'text-slate-600 hover:bg-indigo-50'
      }`}
    >
      <I size={16} weight="fill" /> {label}
    </button>
  );

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {typeBtn('student', 'Student', Student)}
          {typeBtn('staff', 'Staff', ChalkboardTeacher)}
        </div>

        <div className="flex items-center gap-4">
          {member.photoDataUrl ? (
            <img src={member.photoDataUrl} alt="" className="h-16 w-16 rounded-full object-cover ring-1 ring-slate-900/10" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
              No photo
            </div>
          )}
          <Field label="Photo" className="flex-1">
            <input
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onPhotoPick(e.target.files?.[0])}
            />
          </Field>
        </div>
        <Field label="Full name *">
          <input className={inputCls} value={member.name} onChange={(e) => set({ name: e.target.value })} required autoFocus />
        </Field>

        {isStudent && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Class">
                <input className={inputCls} placeholder="e.g. 10" value={member.class_name ?? ''} onChange={(e) => set({ class_name: e.target.value || null })} />
              </Field>
              <Field label="Section">
                <input className={inputCls} placeholder="e.g. B" value={member.section ?? ''} onChange={(e) => set({ section: e.target.value || null })} />
              </Field>
              <Field label="Roll no">
                <input className={inputCls} value={member.roll_no ?? ''} onChange={(e) => set({ roll_no: e.target.value || null })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guardian name">
                <input className={inputCls} value={member.guardian_name ?? ''} onChange={(e) => set({ guardian_name: e.target.value || null })} />
              </Field>
              <Field label="Guardian phone">
                <input className={inputCls} value={member.guardian_phone ?? ''} onChange={(e) => set({ guardian_phone: e.target.value || null })} />
              </Field>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={isStudent ? 'Student phone' : 'Phone'}>
            <input className={inputCls} value={member.phone ?? ''} onChange={(e) => set({ phone: e.target.value || null })} />
          </Field>
          <Field label="Email">
            <input className={inputCls} type="email" value={member.email ?? ''} onChange={(e) => set({ email: e.target.value || null })} />
          </Field>
          <Field label="Join date">
            <input className={inputCls} type="date" value={member.join_date} onChange={(e) => set({ join_date: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={member.status} onChange={(e) => set({ status: e.target.value as MemberInput['status'] })}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={`${inputCls} h-16`} value={member.notes ?? ''} onChange={(e) => set({ notes: e.target.value || null })} />
        </Field>
        {error && <ErrorNote error={error} />}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={save.isPending}>
            Save
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
