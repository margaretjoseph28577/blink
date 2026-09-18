import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, CheckCircle, Package, Play, XCircle } from '@phosphor-icons/react';
import { call } from '../../api/client';
import { ErrorNote, Field, Table, btnDanger, btnPrimary, btnSecondary, inputCls, tdCls, thCls } from '../../components/ui';

interface ScanLog {
  accession: string;
  ok: boolean;
  title?: string;
  dup?: boolean;
}

export default function StockVerificationPage() {
  const qc = useQueryClient();
  const [accession, setAccession] = useState('');
  const [log, setLog] = useState<ScanLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['stock-summary'],
    queryFn: () => call('stock:summary'),
    refetchInterval: 5000,
  });

  const begin = useMutation({
    mutationFn: () => call('stock:begin'),
    onSuccess: () => {
      setLog([]);
      qc.invalidateQueries({ queryKey: ['stock-summary'] });
    },
  });

  const scan = useMutation({
    mutationFn: (acc: string) => call('stock:scan', { accessionNumber: acc }),
    onSuccess: (res, acc) => {
      setLog((l) => [
        { accession: acc, ok: res.found, title: res.title, dup: res.alreadyScanned },
        ...l.slice(0, 49),
      ]);
      setAccession('');
      qc.invalidateQueries({ queryKey: ['stock-summary'] });
    },
    onError: (e) => setError(e.message),
  });

  const markLost = useMutation({
    mutationFn: (copyIds: number[]) => call('stock:markMissingLost', { copyIds }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => setError(e.message),
  });

  const active = !!summary?.sessionStartedAt;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Stock Verification</h1>
        <button className={btnPrimary} onClick={() => begin.mutate()}>
          {active ? <ArrowCounterClockwise size={15} weight="bold" /> : <Play size={15} weight="fill" />}
          {active ? 'Restart session' : 'Start session'}
        </button>
      </div>

      {error && <ErrorNote error={error} />}

      {active && summary && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-center shadow-sm">
              <div className="text-2xl font-bold">{summary.totalActive}</div>
              <div className="text-xs text-slate-500 uppercase">Copies in stock (incl. on loan)</div>
            </div>
            <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">{summary.verifiedCount}</div>
              <div className="text-xs text-slate-500 uppercase">Scanned / verified</div>
            </div>
            <div className="rounded-lg border border-slate-200/70 bg-white p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-red-600">{summary.missing.length}</div>
              <div className="text-xs text-slate-500 uppercase">Not yet scanned</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (accession.trim()) scan.mutate(accession.trim());
              }}
            >
              <Field label="Scan accession number (barcode scanner or type + Enter)">
                <input
                  className={`${inputCls} max-w-sm font-mono`}
                  value={accession}
                  onChange={(e) => setAccession(e.target.value)}
                  autoFocus
                />
              </Field>
            </form>
            {log.length > 0 && (
              <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
                {log.map((s, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-1.5 ${s.ok ? (s.dup ? 'text-amber-600' : 'text-emerald-700') : 'text-red-600'}`}
                  >
                    {s.ok ? (
                      s.dup ? (
                        <ArrowCounterClockwise size={13} weight="bold" className="shrink-0" />
                      ) : (
                        <CheckCircle size={13} weight="fill" className="shrink-0" />
                      )
                    ) : (
                      <XCircle size={13} weight="fill" className="shrink-0" />
                    )}
                    {s.ok
                      ? `${s.dup ? 'already scanned — ' : ''}${s.accession} — ${s.title}`
                      : `${s.accession} — not found in catalog`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Unscanned copies ({summary.missing.length})
                <span className="ml-2 text-sm font-normal text-slate-400">
                  copies on loan are excluded — they are with members
                </span>
              </h2>
              {summary.missing.length > 0 && (
                <button
                  className={btnDanger}
                  onClick={() => {
                    if (
                      confirm(
                        `Mark all ${summary.missing.length} unscanned copies as LOST? Do this only after the full shelf scan is complete.`,
                      )
                    ) {
                      markLost.mutate(summary.missing.map((m) => m.id));
                    }
                  }}
                >
                  Mark all as lost
                </button>
              )}
            </div>
            {summary.missing.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle size={15} weight="fill" /> All copies accounted for
              </p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th className={thCls}>Accession No</th>
                    <th className={thCls}>Title</th>
                    <th className={thCls}>Author</th>
                    <th className={thCls}>Shelf</th>
                    <th className={thCls}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.missing.map((c) => (
                    <tr key={c.id}>
                      <td className={`${tdCls} font-mono`}>{c.accession_number}</td>
                      <td className={tdCls}>{c.title}</td>
                      <td className={tdCls}>{c.authors}</td>
                      <td className={tdCls}>{c.shelf_location ?? '—'}</td>
                      <td className={tdCls}>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => markLost.mutate([c.id])}
                        >
                          Mark lost
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </section>
        </>
      )}

      {!active && (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          <Package size={40} weight="duotone" className="mx-auto mb-3 text-slate-300" />
          <p>
            Start a session, then walk the shelves scanning every copy's accession barcode.
            <br />
            At the end, anything unscanned (and not on loan) is flagged as missing.
          </p>
        </div>
      )}
    </div>
  );
}
