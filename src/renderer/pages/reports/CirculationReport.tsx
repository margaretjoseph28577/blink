import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { call, formatDate, formatMoney } from '../../api/client';
import { Badge, EmptyState, Field, Table, btnSecondary, inputCls, tdCls, thCls } from '../../components/ui';
import ReportShell, { rangeLabel, useDateRange } from './ReportShell';

type Status = '' | 'active' | 'returned' | 'overdue';

export default function CirculationReport() {
  const { fromDate, toDate, setFromDate, setToDate } = useDateRange();
  const [status, setStatus] = useState<Status>('');
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data: rows, isFetching } = useQuery({
    queryKey: ['report-circulation', fromDate, toDate, status],
    queryFn: () =>
      call('reports:circulation', {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        status: status || undefined,
      }),
  });
  const sym = settings?.currency_symbol ?? '₹';

  return (
    <ReportShell
      title="Circulation Register"
      subtitle={rangeLabel(fromDate, toDate)}
      exportDisabled={!rows?.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'circulation-register.csv',
          headers: ['Accession No', 'Title', 'Author', 'Member ID', 'Member', 'Issued', 'Due', 'Returned', 'Renewals', 'Status', 'Days late', `Fine ${sym}`],
          rows: (rows ?? []).map((l) => [
            l.accession_number, l.title, l.authors, l.member_code, l.member_name,
            l.checkout_date, l.due_date, l.return_date, l.renewals_count,
            l.status === 'active' && l.days_overdue > 0 ? 'overdue' : l.status,
            l.days_overdue || null,
            l.accruing_fine_paise ? (l.accruing_fine_paise / 100).toFixed(2) : null,
          ]),
        })
      }
      filters={
        <>
          <Field label="From (issue date)">
            <input className={inputCls} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="To">
            <input className={inputCls} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="returned">Returned</option>
            </select>
          </Field>
          <button className={btnSecondary} onClick={() => { setFromDate(''); setToDate(''); setStatus(''); }}>
            Clear
          </button>
        </>
      }
    >
      {isFetching ? (
        <div className="text-slate-400">Loading…</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="No loans match" />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">{rows.length} loan{rows.length === 1 ? '' : 's'}</p>
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Accession No</th>
                <th className={thCls}>Title</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Issued</th>
                <th className={thCls}>Due</th>
                <th className={thCls}>Returned</th>
                <th className={`${thCls} text-right`}>Renewals</th>
                <th className={thCls}>Status</th>
                <th className={`${thCls} text-right`}>Fine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className={`${tdCls} font-mono`}>{l.accession_number}</td>
                  <td className={tdCls}>{l.title}</td>
                  <td className={tdCls}>
                    {l.member_name} <span className="font-mono text-xs text-slate-400">{l.member_code}</span>
                  </td>
                  <td className={tdCls}>{formatDate(l.checkout_date)}</td>
                  <td className={tdCls}>{formatDate(l.due_date)}</td>
                  <td className={tdCls}>{formatDate(l.return_date)}</td>
                  <td className={`${tdCls} text-right`}>{l.renewals_count}</td>
                  <td className={tdCls}>
                    <Badge value={l.status === 'active' && l.days_overdue > 0 ? 'overdue' : l.status} />
                  </td>
                  <td className={`${tdCls} text-right`}>
                    {l.accruing_fine_paise > 0 ? formatMoney(l.accruing_fine_paise, sym) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length >= 2000 && (
            <p className="no-print mt-2 text-xs text-slate-400">
              Showing the first 2000 loans — narrow the date range or status filter for a complete report.
            </p>
          )}
        </>
      )}
    </ReportShell>
  );
}
