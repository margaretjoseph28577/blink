import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, CopySimple } from '@phosphor-icons/react';
import { call, formatDate, formatMoney, today } from '../../api/client';
import { EmptyState, Table, tdCls, thCls } from '../../components/ui';
import ReportShell from './ReportShell';

export default function OverdueReport() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data: rows, isFetching } = useQuery({
    queryKey: ['report-overdue'],
    queryFn: () => call('reports:overdue'),
  });
  const sym = settings?.currency_symbol ?? '₹';
  const totalAccruing = (rows ?? []).reduce((s, r) => s + r.accruing_fine_paise, 0);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const copyReminder = async (r: NonNullable<typeof rows>[number]) => {
    const text =
      `Dear ${r.member_name}, this is a reminder from ${settings?.library_name ?? 'the library'}: ` +
      `"${r.title}" (${r.accession_number}) was due on ${formatDate(r.due_date)} and is now ` +
      `${r.days_overdue} day(s) overdue. Fine so far: ${formatMoney(r.accruing_fine_paise, sym)}. ` +
      `Please return it at the earliest.`;
    await navigator.clipboard.writeText(text);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 2000);
  };

  return (
    <ReportShell
      title="Overdue Books"
      subtitle={`as on ${formatDate(today())}`}
      exportDisabled={!rows?.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'overdue-books.csv',
          headers: ['Accession No', 'Title', 'Member ID', 'Member', 'Phone', 'Email', 'Issued', 'Due', 'Days late', `Accruing fine ${sym}`],
          rows: (rows ?? []).map((r) => [
            r.accession_number, r.title, r.member_code, r.member_name, r.phone, r.email,
            r.checkout_date, r.due_date, r.days_overdue, (r.accruing_fine_paise / 100).toFixed(2),
          ]),
        })
      }
    >
      {isFetching ? (
        <div className="text-slate-400">Loading…</div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState message="Nothing is overdue" />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {rows.length} overdue loan{rows.length === 1 ? '' : 's'} — total accruing fines{' '}
            <b className="text-red-600">{formatMoney(totalAccruing, sym)}</b>
          </p>
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Accession No</th>
                <th className={thCls}>Title</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Phone</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Due</th>
                <th className={`${thCls} text-right`}>Days late</th>
                <th className={`${thCls} text-right`}>Accruing fine</th>
                <th className={`${thCls} no-print`}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${tdCls} font-mono`}>{r.accession_number}</td>
                  <td className={tdCls}>{r.title}</td>
                  <td className={tdCls}>
                    {r.member_name} <span className="font-mono text-xs text-slate-400">{r.member_code}</span>
                  </td>
                  <td className={tdCls}>{r.phone ?? '—'}</td>
                  <td className={tdCls}>{r.email ?? '—'}</td>
                  <td className={tdCls}>{formatDate(r.due_date)}</td>
                  <td className={`${tdCls} text-right font-semibold text-red-600`}>{r.days_overdue}</td>
                  <td className={`${tdCls} text-right`}>{formatMoney(r.accruing_fine_paise, sym)}</td>
                  <td className={`${tdCls} no-print whitespace-nowrap`}>
                    <button
                      className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                      onClick={() => copyReminder(r)}
                      title="Copy a reminder message to paste into SMS, WhatsApp or email"
                    >
                      {copiedId === r.id ? (
                        <>
                          <CheckCircle size={14} weight="fill" className="text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <CopySimple size={14} weight="bold" /> Copy reminder
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </ReportShell>
  );
}
