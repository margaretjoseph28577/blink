import { useQuery } from '@tanstack/react-query';
import { call, formatDate, formatMoney, today } from '../../api/client';
import { EmptyState, Table, tdCls, thCls } from '../../components/ui';
import ReportShell from './ReportShell';

export default function CollectionSummaryReport() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data, isFetching } = useQuery({
    queryKey: ['report-collection-summary'],
    queryFn: () => call('reports:collectionSummary'),
  });
  const sym = settings?.currency_symbol ?? '₹';

  return (
    <ReportShell
      title="Collection Summary"
      subtitle={`as on ${formatDate(today())}`}
      exportDisabled={!data?.rows.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'collection-summary.csv',
          headers: ['Category', 'Titles', 'Copies', 'Available', 'On loan', 'Lost', 'Damaged', 'Withdrawn', `Value ${sym}`],
          rows: [...(data?.rows ?? []), ...(data ? [data.totals] : [])].map((r) => [
            r.category, r.titles, r.copies, r.available, r.on_loan, r.lost, r.damaged, r.withdrawn,
            (r.total_cost_paise / 100).toFixed(2),
          ]),
        })
      }
    >
      {isFetching ? (
        <div className="text-slate-400">Loading…</div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="No books in the catalog yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={thCls}>Category</th>
              <th className={`${thCls} text-right`}>Titles</th>
              <th className={`${thCls} text-right`}>Copies</th>
              <th className={`${thCls} text-right`}>Available</th>
              <th className={`${thCls} text-right`}>On loan</th>
              <th className={`${thCls} text-right`}>Lost</th>
              <th className={`${thCls} text-right`}>Damaged</th>
              <th className={`${thCls} text-right`}>Withdrawn</th>
              <th className={`${thCls} text-right`}>Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((r) => (
              <tr key={r.category}>
                <td className={`${tdCls} font-medium`}>{r.category}</td>
                <td className={`${tdCls} text-right`}>{r.titles}</td>
                <td className={`${tdCls} text-right`}>{r.copies}</td>
                <td className={`${tdCls} text-right text-emerald-700`}>{r.available}</td>
                <td className={`${tdCls} text-right text-amber-700`}>{r.on_loan}</td>
                <td className={`${tdCls} text-right ${r.lost ? 'font-semibold text-red-600' : ''}`}>{r.lost}</td>
                <td className={`${tdCls} text-right`}>{r.damaged}</td>
                <td className={`${tdCls} text-right`}>{r.withdrawn}</td>
                <td className={`${tdCls} text-right`}>{formatMoney(r.total_cost_paise, sym)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-semibold">
              <td className={tdCls}>Total</td>
              <td className={`${tdCls} text-right`}>{data.totals.titles}</td>
              <td className={`${tdCls} text-right`}>{data.totals.copies}</td>
              <td className={`${tdCls} text-right`}>{data.totals.available}</td>
              <td className={`${tdCls} text-right`}>{data.totals.on_loan}</td>
              <td className={`${tdCls} text-right`}>{data.totals.lost}</td>
              <td className={`${tdCls} text-right`}>{data.totals.damaged}</td>
              <td className={`${tdCls} text-right`}>{data.totals.withdrawn}</td>
              <td className={`${tdCls} text-right`}>{formatMoney(data.totals.total_cost_paise, sym)}</td>
            </tr>
          </tfoot>
        </Table>
      )}
    </ReportShell>
  );
}
