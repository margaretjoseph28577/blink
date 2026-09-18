import { useQuery } from '@tanstack/react-query';
import { call, formatDate } from '../../api/client';
import { EmptyState, Field, Table, btnSecondary, inputCls, tdCls, thCls } from '../../components/ui';
import ReportShell, { rangeLabel, useDateRange } from './ReportShell';

export default function PopularReport() {
  const { fromDate, toDate, setFromDate, setToDate } = useDateRange();
  const { data: rows, isFetching } = useQuery({
    queryKey: ['report-popular', fromDate, toDate],
    queryFn: () =>
      call('reports:popular', {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: 50,
      }),
  });

  return (
    <ReportShell
      title="Most Borrowed Books"
      subtitle={rangeLabel(fromDate, toDate) ?? 'all time'}
      exportDisabled={!rows?.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'popular-books.csv',
          headers: ['Rank', 'Title', 'Author', 'Category', 'Times borrowed', 'Unique borrowers', 'Last borrowed'],
          rows: (rows ?? []).map((r, i) => [
            i + 1, r.title, r.authors, r.category, r.loan_count, r.unique_borrowers, r.last_borrowed,
          ]),
        })
      }
      filters={
        <>
          <Field label="From date">
            <input className={inputCls} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To date">
            <input className={inputCls} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <button className={btnSecondary} onClick={() => { setFromDate(''); setToDate(''); }}>
            Clear
          </button>
        </>
      }
    >
      {isFetching ? (
        <div className="text-slate-400">Loading…</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="No loans in this range" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={thCls}>#</th>
              <th className={thCls}>Title</th>
              <th className={thCls}>Author</th>
              <th className={thCls}>Category</th>
              <th className={`${thCls} text-right`}>Times borrowed</th>
              <th className={`${thCls} text-right`}>Unique borrowers</th>
              <th className={thCls}>Last borrowed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.book_id}>
                <td className={`${tdCls} text-slate-400`}>{i + 1}</td>
                <td className={`${tdCls} font-medium`}>{r.title}</td>
                <td className={tdCls}>{r.authors}</td>
                <td className={tdCls}>{r.category ?? '—'}</td>
                <td className={`${tdCls} text-right font-semibold`}>{r.loan_count}</td>
                <td className={`${tdCls} text-right`}>{r.unique_borrowers}</td>
                <td className={tdCls}>{formatDate(r.last_borrowed)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </ReportShell>
  );
}
