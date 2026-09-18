import { useQuery } from '@tanstack/react-query';
import { call, formatDateTime, formatMoney } from '../../api/client';
import { EmptyState, Field, Table, btnSecondary, inputCls, tdCls, thCls } from '../../components/ui';
import ReportShell, { rangeLabel, useDateRange } from './ReportShell';

export default function FineCollectionsReport() {
  const { fromDate, toDate, setFromDate, setToDate } = useDateRange();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data, isFetching } = useQuery({
    queryKey: ['report-collections', fromDate, toDate],
    queryFn: () =>
      call('reports:fineCollections', {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
  });
  const sym = settings?.currency_symbol ?? '₹';

  return (
    <ReportShell
      title="Fine Collections"
      subtitle={rangeLabel(fromDate, toDate)}
      exportDisabled={!data?.rows.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'fine-collections.csv',
          headers: ['Receipt No', 'Date', 'Member ID', 'Member', 'Book', `Amount ${sym}`, 'Recorded by', 'Note'],
          rows: (data?.rows ?? []).map((r) => [
            r.id, r.paid_at, r.member_code, r.member_name, r.title,
            (r.amount_paise / 100).toFixed(2), r.recorded_by_username, r.note,
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
      ) : !data || data.rows.length === 0 ? (
        <EmptyState message="No payments recorded in this range" />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {data.rows.length} payment{data.rows.length === 1 ? '' : 's'} — total collected{' '}
            <b className="text-emerald-700">{formatMoney(data.totalPaise, sym)}</b>
          </p>
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Receipt</th>
                <th className={thCls}>Date</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Book</th>
                <th className={`${thCls} text-right`}>Amount</th>
                <th className={thCls}>Recorded by</th>
                <th className={thCls}>Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${tdCls} font-mono`}>#{r.id}</td>
                  <td className={tdCls}>{formatDateTime(r.paid_at)}</td>
                  <td className={tdCls}>
                    {r.member_name} <span className="font-mono text-xs text-slate-400">{r.member_code}</span>
                  </td>
                  <td className={tdCls}>{r.title ?? '—'}</td>
                  <td className={`${tdCls} text-right font-semibold`}>{formatMoney(r.amount_paise, sym)}</td>
                  <td className={tdCls}>{r.recorded_by_username ?? '—'}</td>
                  <td className={tdCls}>{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className={tdCls} colSpan={4}>Total</td>
                <td className={`${tdCls} text-right`}>{formatMoney(data.totalPaise, sym)}</td>
                <td className={tdCls} colSpan={2}></td>
              </tr>
            </tfoot>
          </Table>
        </>
      )}
    </ReportShell>
  );
}
