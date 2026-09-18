import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Icon } from '@phosphor-icons/react';
import {
  Alarm, Archive, ArrowDown, ArrowUp, ArrowsLeftRight, BookOpen, Books, CalendarCheck, CaretRight,
  ChartBar, CheckCircle, Coins, MagnifyingGlass, Plus, Tag, UserPlus, UsersThree,
} from '@phosphor-icons/react';
import { call, formatDate, formatMoney, today } from '../api/client';
import CoverThumb from '../components/CoverThumb';
import { ActivityList } from '../components/ActivityFeed';
import { CategoryBars, TrendChart } from '../components/Charts';
import { Card, EmptyState, StatCard, Table, ViewAllLink, btnPrimary, btnSecondary, tdCls, thCls } from '../components/ui';
import { useAuth } from '../AuthContext';
import type { WeekStats } from '../../shared/types';

const quickActions: { to: string; label: string; icon: Icon; chip: string }[] = [
  { to: '/circulation', label: 'Issue / Return', icon: ArrowsLeftRight, chip: 'bg-indigo-50 text-indigo-600' },
  { to: '/catalog/new', label: 'Add New Book', icon: Books, chip: 'bg-emerald-50 text-emerald-600' },
  { to: '/members', label: 'Register Member', icon: UserPlus, chip: 'bg-purple-50 text-purple-600' },
  { to: '/catalog', label: 'Search Catalog', icon: MagnifyingGlass, chip: 'bg-amber-50 text-amber-600' },
  { to: '/reports', label: 'Generate Report', icon: ChartBar, chip: 'bg-sky-50 text-sky-600' },
];

/** Signed change vs the previous period; null when there's no baseline to compare against. */
function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return <span className="text-xs font-medium text-slate-400">— no change</span>;
  if (previous === 0) return <span className="text-xs font-semibold text-emerald-600">new this week</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs font-medium text-slate-400">— same as last week</span>;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
      {up ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
      {Math.abs(pct)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string | number;
  current: number;
  previous: number;
}) {
  return (
    <div className="px-5 py-3.5">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2.5">
        <span className="text-2xl font-bold tracking-tight text-slate-800">{value}</span>
        <Delta current={current} previous={previous} />
      </div>
    </div>
  );
}

/** Whole days from today to an ISO date (both local calendar dates). */
function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = today().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => call('reports:dashboard'),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const checkin = useMutation({
    mutationFn: (accessionNumber: string) => call('circ:checkin', { accessionNumber }),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (isLoading || !data) return <div className="text-slate-400">Loading dashboard…</div>;
  const sym = settings?.currency_symbol ?? '₹';
  const wk: WeekStats = data.weekly.current;
  const prev: WeekStats = data.weekly.previous;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back, {user?.username ?? 'Librarian'}! 👋</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Here's what's happening at {settings?.library_name ?? 'your library'} · {todayLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/catalog/new" className={btnSecondary}>
            <Plus size={15} weight="bold" /> Add Book
          </Link>
          <Link to="/members" className={btnSecondary}>
            <UserPlus size={15} weight="fill" /> Register Member
          </Link>
          <Link to="/circulation" className={btnPrimary}>
            <ArrowsLeftRight size={15} weight="fill" /> Issue / Return
          </Link>
        </div>
      </div>

      {/* ---- stat tiles ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total titles" value={data.totals.titles} icon={<Tag size={22} weight="fill" />} tone="indigo" to="/catalog" />
        <StatCard label="Copies in collection" value={data.totals.copies} icon={<Archive size={22} weight="fill" />} tone="sky" to="/catalog" />
        <StatCard label="Active members" value={data.totals.members} icon={<UsersThree size={22} weight="fill" />} tone="green" to="/members" />
        <StatCard label="Books on loan" value={data.totals.activeLoans} icon={<BookOpen size={22} weight="fill" />} tone="amber" to="/loans" />
        <StatCard
          label="Overdue returns"
          value={data.totals.overdue}
          icon={<Alarm size={22} weight="fill" />}
          tone={data.totals.overdue > 0 ? 'red' : 'slate'}
          to="/loans?filter=overdue"
        />
        <StatCard
          label="Unpaid fines"
          value={formatMoney(data.totals.outstandingFinesPaise, sym)}
          icon={<Coins size={22} weight="fill" />}
          tone={data.totals.outstandingFinesPaise > 0 || data.totals.accruingFinesPaise > 0 ? 'red' : 'slate'}
          to="/fines"
          sub={data.totals.accruingFinesPaise > 0 && `+${formatMoney(data.totals.accruingFinesPaise, sym)} accruing`}
          subTone="red"
          subTitle="Fines building up on overdue books — charged when they are returned"
        />
      </div>

      {/* ---- main columns: overview + breakdowns | quick actions + activity ---- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Overview"
            padded={false}
            action={<span className="text-xs font-medium text-slate-400">Last 7 days vs previous 7</span>}
          >
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-y border-slate-100 md:grid-cols-4">
              <Kpi label="Books issued" value={wk.issued} current={wk.issued} previous={prev.issued} />
              <Kpi label="Books returned" value={wk.returned} current={wk.returned} previous={prev.returned} />
              <Kpi label="New members" value={wk.newMembers} current={wk.newMembers} previous={prev.newMembers} />
              <Kpi
                label="Fines collected"
                value={formatMoney(wk.finesCollectedPaise, sym)}
                current={wk.finesCollectedPaise}
                previous={prev.finesCollectedPaise}
              />
            </div>
            <div className="px-4 pt-4 pb-3">
              <TrendChart days={data.weekly.days} />
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Top Categories" action={<ViewAllLink to="/reports?tab=summary">Full report</ViewAllLink>}>
              {data.categories.length === 0 ? (
                <EmptyState message="No copies catalogued yet" />
              ) : (
                <CategoryBars rows={data.categories} />
              )}
            </Card>

            <Card title="Due Soon" action={<ViewAllLink to="/loans?filter=active" />} padded={false}>
              {data.dueSoon.length === 0 ? (
                <div className="flex items-center justify-center gap-2 px-5 pt-2 pb-6 text-sm text-slate-400">
                  <CalendarCheck size={16} weight="fill" className="text-emerald-500" />
                  Nothing due in the next 3 days
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.dueSoon.map((l) => {
                    const n = daysUntil(l.due_date);
                    return (
                      <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                        <CoverThumb bookId={l.book_id} />
                        <div className="min-w-0 flex-1">
                          <Link to={`/catalog/${l.book_id}`} className="block truncate text-sm font-semibold text-slate-800 hover:text-indigo-600 hover:underline">
                            {l.title}
                          </Link>
                          <div className="truncate text-xs text-slate-500">
                            {l.authors && <span>by {l.authors} · </span>}
                            <Link to={`/members/${l.member_id}`} className="hover:text-indigo-600 hover:underline">
                              {l.member_name}
                            </Link>
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          {n <= 0 ? (
                            <span className="font-semibold text-amber-600">Due today</span>
                          ) : (
                            <>
                              <div className="text-slate-400">Due in</div>
                              <div className="font-semibold text-amber-600">{n} day{n === 1 ? '' : 's'}</div>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card title="Quick Actions">
            <div className="space-y-2">
              {quickActions.map((a) => (
                <Link
                  key={a.to + a.label}
                  to={a.to}
                  className="group flex items-center gap-3 rounded-md border border-slate-200/80 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/60"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${a.chip}`}>
                    <a.icon size={16} weight="fill" />
                  </span>
                  <span className="flex-1">{a.label}</span>
                  <CaretRight size={14} weight="bold" className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </Link>
              ))}
            </div>
          </Card>

          <Card title="Recent Activity" action={<ViewAllLink to="/activity" />} padded={false}>
            {data.recentActivity.length === 0 ? (
              <div className="px-5 pb-5">
                <EmptyState message="No activity yet" />
              </div>
            ) : (
              <ActivityList items={data.recentActivity.slice(0, 6)} />
            )}
          </Card>
        </div>
      </div>

      {/* ---- overdue ---- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Overdue books
            {data.overdueLoans.length > 0 && (
              <span className="font-normal text-slate-400"> ({data.overdueLoans.length})</span>
            )}
          </h2>
          {data.overdueLoans.length > 0 && <ViewAllLink to="/loans?filter=overdue">View all →</ViewAllLink>}
        </div>
        {data.overdueLoans.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-white py-6 text-sm text-slate-400 shadow-sm">
            <CheckCircle size={16} weight="fill" className="text-emerald-500" />
            Nothing is overdue
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Accession No</th>
                <th className={thCls}>Title</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Due date</th>
                <th className={`${thCls} text-right`}>Days late</th>
                <th className={`${thCls} text-right`}>Accruing fine</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.overdueLoans.map((l) => (
                <tr key={l.id}>
                  <td className={`${tdCls} font-mono`}>{l.accession_number}</td>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2.5">
                      <CoverThumb bookId={l.book_id} />
                      <Link to={`/catalog/${l.book_id}`} className="text-indigo-600 hover:underline">
                        {l.title}
                      </Link>
                    </div>
                  </td>
                  <td className={tdCls}>
                    <Link to={`/members/${l.member_id}`} className="text-indigo-600 hover:underline">
                      {l.member_name}
                    </Link>
                  </td>
                  <td className={tdCls}>{formatDate(l.due_date)}</td>
                  <td className={`${tdCls} text-right font-semibold text-red-600`}>{l.days_overdue}</td>
                  <td className={`${tdCls} text-right`}>{formatMoney(l.accruing_fine_paise, sym)}</td>
                  <td className={tdCls}>
                    <button
                      className="text-sm text-indigo-600 hover:underline"
                      onClick={() => checkin.mutate(l.accession_number)}
                    >
                      Return
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* ---- popular ---- */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Popular books (90 days)</h2>
        {data.popularBooks.length === 0 ? (
          <EmptyState message="No loans yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Title</th>
                <th className={thCls}>Author</th>
                <th className={`${thCls} text-right`}>Loans</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.popularBooks.map((b, i) => (
                <tr key={b.book_id}>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                          i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <CoverThumb bookId={b.book_id} />
                      <Link to={`/catalog/${b.book_id}`} className="text-indigo-600 hover:underline">
                        {b.title}
                      </Link>
                    </div>
                  </td>
                  <td className={tdCls}>{b.authors}</td>
                  <td className={`${tdCls} text-right font-semibold`}>{b.loan_count}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
