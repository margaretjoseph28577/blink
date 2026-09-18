import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Icon } from '@phosphor-icons/react';
import {
  ArrowCounterClockwise, Books, Buildings, CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, CheckCircle,
  DownloadSimple, Eye, MagnifyingGlass, PencilSimple, Plus, Rows, SquaresFour, Stack, Tag, Trash,
} from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { call, today } from '../../api/client';
import { BOOK_IMPORT_TEMPLATE_HEADERS, RESOURCE_TYPES } from '../../../shared/types';
import type { BookListRow, BookSort, BookStatusFilter } from '../../../shared/types';
import BookQuickView from '../../components/BookQuickView';
import { CoverLarge } from '../../components/CoverThumb';
import { ImportCsvButton } from '../../components/ImportCsvModal';
import { Badge, EmptyState, ErrorNote, StatCard, ViewAllLink, btnPrimary, btnSecondary, inputCls, tdCls, thCls } from '../../components/ui';

type View = 'table' | 'grid';
type StatusValue = '' | BookStatusFilter;
const PAGE_SIZES = [10, 25, 50, 100];
const compactInput = inputCls.replace('w-full ', '');

const STATUS_OPTIONS: { value: StatusValue; label: string; dot: string; statKey: 'copies' | 'available' | 'onLoan' | 'lostDamaged' | 'withdrawn' }[] = [
  { value: '', label: 'All books', dot: 'bg-slate-400', statKey: 'copies' },
  { value: 'available', label: 'Available', dot: 'bg-emerald-500', statKey: 'available' },
  { value: 'issued', label: 'Issued', dot: 'bg-indigo-500', statKey: 'onLoan' },
  { value: 'lost_damaged', label: 'Lost / Damaged', dot: 'bg-red-500', statKey: 'lostDamaged' },
  { value: 'withdrawn', label: 'Withdrawn', dot: 'bg-slate-300', statKey: 'withdrawn' },
];

function initialView(): View {
  try {
    return localStorage.getItem('catalog-view') === 'grid' ? 'grid' : 'table';
  } catch {
    return 'table';
  }
}

function SortHeader({
  label, k, sort, onSort, align = 'left',
}: {
  label: string; k: BookSort; sort: { key: BookSort; dir: 'asc' | 'desc' }; onSort: (k: BookSort) => void; align?: 'left' | 'right';
}) {
  const active = sort.key === k;
  const Arrow: Icon = active ? (sort.dir === 'asc' ? CaretUp : CaretDown) : CaretUpDown;
  return (
    <th className={`${thCls} ${align === 'right' ? 'text-right' : ''}`}>
      <button className={`inline-flex items-center gap-1 uppercase transition hover:text-slate-800 ${active ? 'text-slate-800' : ''}`} onClick={() => onSort(k)}>
        {label}
        <Arrow size={12} weight="bold" className={active ? 'text-indigo-600' : 'text-slate-300'} />
      </button>
    </th>
  );
}

/** Title-level status chip: what a librarian needs to know about this title right now. */
function TitleStatus({ b }: { b: BookListRow }) {
  if (b.total_copies === 0) return <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-600/10 ring-inset">No copies</span>;
  if (b.available_copies > 0) return <Badge value="available" />;
  if (b.on_loan_copies > 0) return <span className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-600/10 ring-inset">All issued</span>;
  return <span className="inline-block rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700 ring-1 ring-orange-600/10 ring-inset">Unavailable</span>;
}

export default function CatalogListPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [status, setStatus] = useState<StatusValue>('');
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<{ key: BookSort; dir: 'asc' | 'desc' }>({ key: 'title', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [view, setView] = useState<View>(initialView);
  const [quickView, setQuickView] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('catalog-view', v);
    } catch {
      /* no-op */
    }
  };
  const resetFilters = () => {
    setSearch(''); setCategory(''); setResourceType(''); setStatus(''); setLocation(''); setPage(1);
  };
  const filtersActive = !!(search || category || resourceType || status || location);

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => call('books:categories') });
  const { data: stats } = useQuery({ queryKey: ['books', 'stats'], queryFn: () => call('books:stats') });
  const listArgs = { search, category, resourceType, status: status || undefined, location, sort: sort.key, dir: sort.dir };
  const { data, isLoading } = useQuery({
    queryKey: ['books', listArgs, page, pageSize],
    queryFn: () => call('books:list', { ...listArgs, page, pageSize }),
    placeholderData: keepPreviousData,
  });

  const del = useMutation({
    mutationFn: (id: number) => call('books:delete', { id }),
    onSuccess: () => { setActionError(null); qc.invalidateQueries(); },
    onError: (e) => setActionError(e.message),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  const onSort = (k: BookSort) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'copies' || k === 'available' || k === 'year' ? 'desc' : 'asc' }));
    setPage(1);
  };

  /** Export everything matching the current filters (all pages), not just what's on screen. */
  const exportCsv = async () => {
    const rows: BookListRow[] = [];
    for (let p = 1; ; p++) {
      const chunk = await call('books:list', { ...listArgs, page: p, pageSize: 100 });
      rows.push(...chunk.rows);
      if (rows.length >= chunk.total || chunk.rows.length === 0) break;
    }
    const res = await call('reports:exportCsv', {
      filename: `catalog${status ? `-${status}` : ''}${category ? `-${category}` : ''}-${today()}.csv`,
      headers: ['Title', 'Authors', 'ISBN', 'Category', 'Subject', 'Type', 'Year', 'Publisher', 'Copies', 'Available', 'On loan', 'Locations'],
      rows: rows.map((b) => [
        b.title, b.authors, b.isbn, b.category, b.subject, b.resource_type, b.year, b.publisher,
        b.total_copies, b.available_copies, b.on_loan_copies, b.shelf_locations,
      ]),
    });
    setSavedMsg(res.savedPath ? `Saved ${rows.length} title${rows.length === 1 ? '' : 's'} to ${res.savedPath}` : null);
  };

  const heading = STATUS_OPTIONS.find((o) => o.value === status)?.label ?? 'All books';

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Catalog</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage the library's collection — titles, copies and where they live.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ImportCsvButton
            title="Import catalog from CSV"
            description={
              <>
                One row per copy — rows with the same ISBN (or the same title and authors) become
                one title with multiple copies. Only <b>title</b> is required; blank accession
                numbers are assigned automatically.
              </>
            }
            templateFilename="catalog-import-template.csv"
            templateHeaders={BOOK_IMPORT_TEMPLATE_HEADERS}
            templateRows={[
              ['Wings of Fire', 'A.P.J. Abdul Kalam, Arun Tiwari', '9788173711466', 'Universities Press',
                'Hyderabad', '1999', '1st', '', '180', 'Autobiography', 'Biography', '', 'book',
                '', '', 'Paperback', 'Purchase', '', '250', 'B-12', ''],
              ['Wings of Fire', 'A.P.J. Abdul Kalam, Arun Tiwari', '9788173711466', 'Universities Press',
                'Hyderabad', '1999', '1st', '', '180', 'Autobiography', 'Biography', '', 'book',
                '', '', 'Paperback', 'Donation', '', '', 'B-12', 'Second copy of same title'],
            ]}
            run={(csvText, dryRun) => call('import:booksCsv', { csvText, dryRun })}
            primaryNoun={['title', 'titles']}
            secondaryNoun={['copy', 'copies']}
          />
          <Link to="/catalog/new" className={btnPrimary}>
            <Plus size={16} weight="bold" /> Add Book
          </Link>
        </div>
      </div>

      {/* ---- stat tiles ---- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total titles" value={stats?.titles ?? '—'} icon={<Books size={22} weight="fill" />} tone="indigo" />
        <StatCard label="Total copies" value={stats?.copies ?? '—'} icon={<Stack size={22} weight="fill" />} tone="green" />
        <StatCard label="Categories" value={stats?.categories ?? '—'} icon={<Tag size={22} weight="fill" />} tone="amber" />
        <StatCard label="Publishers" value={stats?.publishers ?? '—'} icon={<Buildings size={22} weight="fill" />} tone="sky" />
        <StatCard
          label="Available copies"
          value={stats?.available ?? '—'}
          icon={<CheckCircle size={22} weight="fill" />}
          tone="green"
          sub={stats && stats.copies > 0 ? `${Math.round((stats.available / stats.copies) * 100)}% on shelf` : undefined}
          subTone="slate"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        {/* ---- left: filters + table ---- */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/70 bg-white p-3 shadow-sm">
            <div className="relative min-w-56 flex-1">
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                className={`${inputCls} pl-9`}
                placeholder="Search title, author, ISBN, subject, accession no…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className={compactInput} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select className={compactInput} value={resourceType} onChange={(e) => { setResourceType(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select className={compactInput} value={status} onChange={(e) => { setStatus(e.target.value as StatusValue); setPage(1); }}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.value === '' ? 'All status' : o.label}</option>
              ))}
            </select>
            {stats && stats.locations.length > 0 && (
              <select className={compactInput} value={location} onChange={(e) => { setLocation(e.target.value); setPage(1); }}>
                <option value="">All locations</option>
                {stats.locations.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            )}
            <button className={btnSecondary} onClick={resetFilters} disabled={!filtersActive} title="Clear all filters">
              <ArrowCounterClockwise size={15} weight="bold" /> Reset
            </button>
            <div className="ml-auto flex shrink-0 overflow-hidden rounded-md border border-slate-300 shadow-sm">
              <button
                className={`px-3 py-2 transition ${view === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                onClick={() => switchView('table')}
                title="Table view"
              >
                <Rows size={16} weight="bold" />
              </button>
              <button
                className={`px-3 py-2 transition ${view === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                onClick={() => switchView('grid')}
                title="Grid view"
              >
                <SquaresFour size={16} weight="bold" />
              </button>
            </div>
          </div>

          <section className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-slate-800">
                {heading}
                <span className="ml-1.5 font-normal text-slate-400">({total.toLocaleString()})</span>
                {search.trim() && <span className="ml-2 text-sm font-normal text-slate-400">matching “{search.trim()}”</span>}
              </h2>
              <button className={btnSecondary} onClick={exportCsv} disabled={total === 0} title="Export every title matching the current filters">
                <DownloadSimple size={15} weight="bold" /> Export CSV
              </button>
            </div>
            {(savedMsg || actionError) && (
              <div className="px-5 pb-3">
                {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
                {actionError && <ErrorNote error={actionError} />}
              </div>
            )}

            {isLoading ? (
              <div className="px-5 pb-6 text-slate-400">Loading…</div>
            ) : !data || data.rows.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState message={filtersActive ? 'No titles match these filters.' : 'No books yet. Add your first book, or import a CSV to get started.'} />
              </div>
            ) : view === 'grid' ? (
              <div className="border-t border-slate-200/70 p-4">
                <BookGrid rows={data.rows} onOpen={setQuickView} />
              </div>
            ) : (
              <div className="overflow-x-auto border-t border-slate-200/70">
                <table className="w-full table-fixed divide-y divide-slate-200 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-50/40">
                  {/* Fixed layout: the title column absorbs leftover width and truncates instead of pushing Actions off-card. */}
                  <colgroup>
                    <col />
                    <col className="w-30" />
                    <col className="w-30" />
                    <col className="w-26" />
                    <col className="w-26" />
                    <col className="w-26" />
                  </colgroup>
                  <thead>
                    <tr>
                      <SortHeader label="Book details" k="title" sort={sort} onSort={onSort} />
                      <SortHeader label="Category" k="category" sort={sort} onSort={onSort} />
                      <SortHeader label="Availability" k="available" sort={sort} onSort={onSort} />
                      <th className={thCls}>Location</th>
                      <th className={thCls}>Status</th>
                      <th className={`${thCls} text-right`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.rows.map((b) => (
                      <tr key={b.id} className="group cursor-pointer" onClick={() => setQuickView(b.id)} title="Click for quick view">
                        <td className={`${tdCls} border-l-2 border-transparent group-hover:border-indigo-400`}>
                          <div className="flex items-center gap-3">
                            <CoverLarge bookId={b.id} className="h-13 w-9 shrink-0 rounded shadow-sm ring-1 ring-slate-900/10 transition group-hover:shadow-md" />
                            <div className="min-w-0">
                              <Link
                                to={`/catalog/${b.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block truncate font-semibold text-slate-800 hover:underline group-hover:text-indigo-600"
                              >
                                {b.title}
                              </Link>
                              <div className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                                <span className="truncate">
                                  {b.authors}
                                  {b.year && <span className="text-slate-400"> · {b.year}</span>}
                                  {b.isbn && <span className="font-mono text-slate-400"> · {b.isbn}</span>}
                                </span>
                                {b.resource_type !== 'book' && <Badge value={b.resource_type} />}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className={tdCls}>
                          {b.category ? (
                            <button
                              className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-600/10 ring-inset hover:bg-indigo-100"
                              onClick={(e) => { e.stopPropagation(); setCategory(b.category ?? ""); setPage(1); }}
                              title={`Filter by ${b.category}`}
                            >
                              {b.category}
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className={tdCls}>
                          <AvailabilityMeter available={b.available_copies} total={b.total_copies} />
                        </td>
                        <td className={`${tdCls} max-w-32 truncate text-slate-600`} title={b.shelf_locations ?? ''}>
                          {b.shelf_locations ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className={tdCls}><TitleStatus b={b} /></td>
                        <td className={`${tdCls} w-28`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <RowAction title="Quick view" icon={Eye} tone="indigo" onClick={() => setQuickView(b.id)} />
                            <RowAction title="Edit" icon={PencilSimple} tone="sky" onClick={() => navigate(`/catalog/${b.id}/edit`)} />
                            <RowAction
                              title={b.on_loan_copies > 0 ? 'Cannot delete — copies are on loan' : 'Delete title and its copies'}
                              icon={Trash}
                              tone="red"
                              disabled={b.on_loan_copies > 0 || del.isPending}
                              onClick={() => { if (confirm(`Delete "${b.title}" and its ${b.total_copies} cop${b.total_copies === 1 ? 'y' : 'ies'}? This cannot be undone.`)) del.mutate(b.id); }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 px-5 py-3 text-sm text-slate-500">
                <span>Showing {start}–{end} of {total.toLocaleString()} title{total === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-2">
                  <select className={`${compactInput} py-1.5`} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
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
            )}
          </section>
        </div>

        {/* ---- right: quick filters + top categories ---- */}
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[15px] font-semibold text-slate-800">Quick Filters</h2>
            <ul className="space-y-0.5">
              {STATUS_OPTIONS.map((o) => {
                const active = status === o.value;
                const count = stats ? stats[o.statKey] : undefined;
                return (
                  <li key={o.value}>
                    <button
                      onClick={() => { setStatus(o.value); setPage(1); }}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} />
                      <span className="flex-1 text-left">{o.label}</span>
                      <span className={`text-xs tabular-nums ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                        {count === undefined ? '' : count.toLocaleString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 px-3 text-[11px] text-slate-400">Counts are copies; the list shows titles with a copy in that state.</p>
          </section>

          <section className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[15px] font-semibold text-slate-800">Top Categories</h2>
            {!stats || stats.topCategories.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No copies catalogued yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {stats.topCategories.map((c) => {
                  const active = category === c.category;
                  return (
                    <li key={c.category}>
                      <button
                        onClick={() => { setCategory(active ? '' : c.category === 'Uncategorised' ? '' : c.category); setPage(1); }}
                        className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${active ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                        <span className="flex-1 truncate text-left">{c.category}</span>
                        <span className={`text-xs tabular-nums ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{c.copies.toLocaleString()}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 px-3">
              <ViewAllLink to="/reports?tab=summary">View all categories →</ViewAllLink>
            </div>
          </section>
        </div>
      </div>

      {quickView !== null && <BookQuickView bookId={quickView} onClose={() => setQuickView(null)} />}
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

/** Count plus a stock meter — how much of this title is on the shelf, at a glance. */
export function AvailabilityMeter({ available, total }: { available: number; total: number }) {
  const ok = available > 0;
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  if (total === 0) return <span className="text-xs text-slate-300">No copies</span>;
  return (
    <div className="min-w-24">
      <div className={`text-xs font-semibold ${ok ? 'text-emerald-700' : 'text-red-600'}`}>
        {ok ? `${available} of ${total} in` : `All ${total} out`}
      </div>
      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-slate-100">
        <div
          className={`h-full rounded transition-all ${ok ? 'bg-emerald-500' : 'bg-red-300'}`}
          style={{ width: `${ok ? Math.max(pct, 10) : 100}%` }}
        />
      </div>
    </div>
  );
}

/** Cover-first grid; clicking a card opens the quick view. */
export function BookGrid({ rows, onOpen }: { rows: BookListRow[]; onOpen: (id: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((b) => (
        <button
          key={b.id}
          onClick={() => onOpen(b.id)}
          className="group overflow-hidden rounded-lg border border-slate-200/70 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
        >
          <div className="relative h-44 w-full overflow-hidden bg-indigo-50">
            <CoverLarge bookId={b.id} className="h-full w-full transition group-hover:scale-[1.03]" />
            <span className="absolute top-2 left-2">
              <Badge value={b.resource_type} />
            </span>
          </div>
          <div className="p-3">
            <div className="truncate text-sm font-bold" title={b.title}>
              {b.title}
            </div>
            <div className="truncate text-xs text-slate-500">{b.authors}</div>
            <div className={`mt-1.5 text-xs font-semibold ${b.available_copies > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {b.available_copies > 0 ? `${b.available_copies} of ${b.total_copies} available` : 'All copies out'}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
