import { useQuery } from '@tanstack/react-query';
import { call, formatDate, formatMoney } from '../../api/client';
import { EmptyState, Field, btnSecondary, inputCls } from '../../components/ui';
import ReportShell, { rangeLabel, useDateRange } from './ReportShell';

export default function AccessionRegisterReport() {
  const { fromDate, toDate, setFromDate, setToDate } = useDateRange();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data: rows, isFetching } = useQuery({
    queryKey: ['accession-register', fromDate, toDate],
    queryFn: () =>
      call('reports:accessionRegister', {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
  });
  const sym = settings?.currency_symbol ?? '₹';
  const headers = [
    'Date', 'Accession Number', 'Author of the book', 'Title of the Book', 'Publisher',
    'Place', 'Volume', 'Edition', 'Year of Publication', 'Binding', 'Pages',
    'Source Bill No', `Cost ${sym}`, 'Subject', 'Remarks',
  ];

  return (
    <ReportShell
      title="Accession Register"
      subtitle={rangeLabel(fromDate, toDate)}
      exportDisabled={!rows?.length}
      onExport={() =>
        call('reports:exportCsv', {
          filename: 'accession-register.csv',
          headers,
          rows: (rows ?? []).map((r) => [
            r.accession_date, r.accession_number, r.authors, r.title, r.publisher, r.place,
            r.volume, r.edition, r.year, r.binding, r.pages,
            [r.source, r.bill_no].filter(Boolean).join(' / ') || null,
            r.cost_paise !== null ? (r.cost_paise / 100).toFixed(2) : null,
            r.subject, r.remarks,
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
        <EmptyState message="No accessions in this range" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} className="border border-slate-400 px-1.5 py-1 text-center font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.accession_number}>
                  <td className="border border-slate-300 px-1.5 py-1 whitespace-nowrap">{formatDate(r.accession_date)}</td>
                  <td className="border border-slate-300 px-1.5 py-1 font-mono whitespace-nowrap">{r.accession_number}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.authors}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.title}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.publisher}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.place}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{r.volume}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{r.edition}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{r.year}</td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.binding}</td>
                  <td className="border border-slate-300 px-1.5 py-1 text-center">{r.pages}</td>
                  <td className="border border-slate-300 px-1.5 py-1">
                    {[r.source, r.bill_no].filter(Boolean).join(' / ')}
                  </td>
                  <td className="border border-slate-300 px-1.5 py-1 text-right whitespace-nowrap">
                    {r.cost_paise !== null ? formatMoney(r.cost_paise, sym) : ''}
                  </td>
                  <td className="border border-slate-300 px-1.5 py-1">{r.subject}</td>
                  <td className="border border-slate-300 px-1.5 py-1">
                    {[r.remarks, r.status !== 'available' && r.status !== 'on_loan' ? r.status : null]
                      .filter(Boolean)
                      .join('; ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportShell>
  );
}
