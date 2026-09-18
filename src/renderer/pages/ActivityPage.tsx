import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import { call } from './../api/client';
import type { ActivityRow } from '../../shared/types';
import { ActivityList, activityMeta } from './../components/ActivityFeed';
import { EmptyState, btnSecondary, inputCls } from './../components/ui';

const PAGE_SIZE = 30;

const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All activity' },
  ...Object.entries(activityMeta)
    .filter(([key]) => key !== 'default')
    .map(([key, meta]) => ({ value: key, label: meta.label })),
];

export default function ActivityPage() {
  const [action, setAction] = useState('');
  const [pages, setPages] = useState(1);

  // Load pages 1..N and concatenate — "Load more" just increments N.
  const { data, isFetching } = useQuery({
    queryKey: ['activity', action, pages],
    queryFn: async () => {
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          call('activity:list', { page: i + 1, pageSize: PAGE_SIZE, action: action || undefined }),
        ),
      );
      return { rows: results.flatMap((r) => r.rows) as ActivityRow[], total: results[0].total };
    },
    placeholderData: keepPreviousData,
  });

  const shown = data?.rows.length ?? 0;
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity Log</h1>
          <p className="text-sm text-slate-500">Complete audit trail, newest first</p>
        </div>
        <Link to="/" className={btnSecondary}>
          <CaretLeft size={15} weight="bold" /> Dashboard
        </Link>
      </div>

      <select
        className={`${inputCls} max-w-56`}
        value={action}
        onChange={(e) => {
          setAction(e.target.value);
          setPages(1);
        }}
      >
        {FILTERS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <div className="rounded-lg border border-slate-200/70 bg-white shadow-sm">
        {!data || data.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState message={isFetching ? 'Loading…' : 'No activity recorded'} />
          </div>
        ) : (
          <>
            <ActivityList items={data.rows} />
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <span className="text-xs text-slate-400">
                Showing {shown} of {total}
              </span>
              {shown < total && (
                <button
                  className="text-sm font-semibold text-indigo-600 hover:underline"
                  onClick={() => setPages((p) => p + 1)}
                  disabled={isFetching}
                >
                  {isFetching ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
