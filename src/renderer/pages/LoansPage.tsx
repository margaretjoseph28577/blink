import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CaretRight, DownloadSimple } from '@phosphor-icons/react';
import LoanQuickView from './../components/LoanQuickView';
import { call, formatDate, formatMoney, today } from './../api/client';
import { LOAN_IMPORT_TEMPLATE_HEADERS } from '../../shared/types';
import CoverThumb from './../components/CoverThumb';
import { ImportCsvButton } from './../components/ImportCsvModal';
import { Badge, DueChip, EmptyState, Table, btnSecondary, inputCls, tdCls, thCls } from './../components/ui';

type Filter = 'all' | 'active' | 'overdue' | 'returned';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'returned', label: 'Returned' },
  { key: 'all', label: 'All' },
];

export default function LoansPage() {
  // The URL is the source of truth so other pages can deep-link, e.g. /loans?filter=overdue.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('filter') as Filter | null;
  const filter: Filter = param && FILTERS.some((f) => f.key === param) ? param : 'active';
  const setFilter = (f: Filter) => setSearchParams(f === 'active' ? {} : { filter: f });
  const [quickView, setQuickView] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const { data: loans, isLoading } = useQuery({
    queryKey: ['loans', filter],
    queryFn: () => call('loans:list', { filter }),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  // Cached everywhere else too — powers the overdue count badge on the filter pill.
  const { data: activeForCounts } = useQuery({
    queryKey: ['loans', 'active-quick'],
    queryFn: () => call('loans:list', { filter: 'active' }),
  });
  const overdueCount = (activeForCounts ?? []).filter((l) => l.days_overdue > 0).length;

  const q = search.trim().toLowerCase();
  const filtered = (loans ?? []).filter(
    (l) =>
      !q ||
      l.title.toLowerCase().includes(q) ||
      l.member_name.toLowerCase().includes(q) ||
      l.accession_number.toLowerCase().includes(q),
  );

  // Exports exactly what's on screen (current filter + search), same columns as the Circulation Register.
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const sym = settings?.currency_symbol ?? '₹';
  const exportCsv = async () => {
    const res = await call('reports:exportCsv', {
      filename: `loans-${filter}-${today()}.csv`,
      headers: ['Accession No', 'Title', 'Author', 'Member ID', 'Member', 'Issued', 'Due', 'Returned', 'Renewals', 'Status', 'Days late', `Fine ${sym}`],
      rows: filtered.map((l) => [
        l.accession_number, l.title, l.authors, l.member_code, l.member_name,
        l.checkout_date, l.due_date, l.return_date, l.renewals_count,
        l.status === 'active' && l.days_overdue > 0 ? 'overdue' : l.status,
        l.days_overdue || null,
        l.accruing_fine_paise ? (l.accruing_fine_paise / 100).toFixed(2) : null,
      ]),
    });
    setSavedMsg(res.savedPath ? `Saved ${filtered.length} loan${filtered.length === 1 ? '' : 's'} to ${res.savedPath}` : null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Loans</h1>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={exportCsv} disabled={filtered.length === 0} title="Export the loans currently listed">
            <DownloadSimple size={15} weight="bold" /> Export CSV
          </button>
          <ImportCsvButton
            title="Import active loans from CSV"
            description={
              <>
                For migrating from another system: each row issues one copy to a member. The copy
                (by <b>accession_number</b>) and member (by <b>member_code</b>) must already exist —
                import the catalog and members first. Blank dates default to today and today +
                loan period. The per-member book limit is not applied to migrated loans.
              </>
            }
            templateFilename="loans-import-template.csv"
            templateHeaders={LOAN_IMPORT_TEMPLATE_HEADERS}
            templateRows={[
              ['ACC-0001', 'M-0001', '2026-08-20', '2026-09-03'],
              ['ACC-0002', 'M-0002', '', ''],
            ]}
            run={(csvText, dryRun) => call('import:loansCsv', { csvText, dryRun })}
            primaryNoun={['loan', 'loans']}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                filter === f.key
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'text-slate-600 hover:bg-indigo-50'
              }`}
            >
              {f.label}
              {f.key === 'overdue' && overdueCount > 0 && (
                <span
                  className={`flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    filter === 'overdue' ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          className={`${inputCls} max-w-xs flex-1`}
          placeholder="Search title, member or accession no…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {q && (
          <span className="text-sm text-slate-400">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>
      {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}

      {isLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={q ? `Nothing matches "${search.trim()}" in this filter` : 'No loans match this filter'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={thCls}>Title</th>
              <th className={thCls}>Member</th>
              <th className={thCls}>Issued</th>
              <th className={thCls}>Due</th>
              <th className={thCls}>Returned</th>
              <th className={`${thCls} text-right`}>Renewals</th>
              <th className={thCls}>Status</th>
              <th className={`${thCls} text-right`}>Fine</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((l) => (
              <tr
                key={l.id}
                className="group cursor-pointer"
                onClick={() => setQuickView(l.id)}
                title="Click for loan details"
              >
                <td className={`${tdCls} border-l-2 border-transparent group-hover:border-indigo-400`}>
                  <div className="flex items-center gap-3">
                    <CoverThumb bookId={l.book_id} />
                    <div className="min-w-0">
                      <Link
                        to={`/catalog/${l.book_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-semibold text-slate-800 hover:underline group-hover:text-indigo-600"
                      >
                        {l.title}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{l.accession_number}</div>
                    </div>
                  </div>
                </td>
                <td className={tdCls}>
                  <Link
                    to={`/members/${l.member_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-700 hover:text-indigo-600 hover:underline"
                  >
                    {l.member_name}
                  </Link>
                </td>
                <td className={tdCls}>{formatDate(l.checkout_date)}</td>
                <td className={tdCls}>
                  <DueChip loan={l} />
                </td>
                <td className={tdCls}>
                  {l.return_date ? formatDate(l.return_date) : <span className="text-slate-300">—</span>}
                </td>
                <td className={`${tdCls} text-right`}>
                  <span
                    className={
                      settings !== undefined && l.renewals_count >= settings.max_renewals
                        ? 'font-semibold text-red-600'
                        : 'text-slate-500'
                    }
                  >
                    {l.renewals_count}
                    {settings !== undefined && ` / ${settings.max_renewals}`}
                  </span>
                </td>
                <td className={tdCls}>
                  <Badge value={l.days_overdue > 0 && l.status === 'active' ? 'overdue' : l.status} />
                </td>
                <td className={`${tdCls} text-right`}>
                  {l.accruing_fine_paise > 0 ? (
                    <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-600/10 ring-inset">
                      {formatMoney(l.accruing_fine_paise, settings?.currency_symbol)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className={`${tdCls} w-8`}>
                  <CaretRight
                    size={14}
                    weight="bold"
                    className="text-slate-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-400 group-hover:opacity-100"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {loans && loans.length >= 500 && (
        <p className="text-xs text-slate-400">
          Showing the first 500 loans — use the status filter to narrow the list.
        </p>
      )}
      {(() => {
        const open = quickView !== null ? loans?.find((l) => l.id === quickView) : undefined;
        return open ? <LoanQuickView loan={open} onClose={() => setQuickView(null)} /> : null;
      })()}
    </div>
  );
}
