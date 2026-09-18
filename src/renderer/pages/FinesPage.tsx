import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { call, formatDate, formatMoney } from './../api/client';
import CoverThumb from './../components/CoverThumb';
import FineQuickView from './../components/FineQuickView';
import type { FineDetail } from '../../shared/types';
import {
  Badge, EmptyState, ErrorNote, Field, Modal, Table,
  btnPrimary, btnSecondary, inputCls, tdCls, thCls,
} from './../components/ui';

const STATUS_FILTERS = [
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'paid', label: 'Paid' },
  { key: 'waived', label: 'Waived' },
  { key: '', label: 'All' },
];

export default function FinesPage() {
  const [status, setStatus] = useState('outstanding');
  const [paying, setPaying] = useState<FineDetail | null>(null);
  const [quickView, setQuickView] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: fines, isLoading } = useQuery({
    queryKey: ['fines', status],
    queryFn: () => call('fines:list', { status: status || undefined }),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  // Powers the total badge on the Outstanding pill, independent of the active filter.
  const { data: outstandingFines } = useQuery({
    queryKey: ['fines', 'outstanding'],
    queryFn: () => call('fines:list', { status: 'outstanding' }),
  });
  const owedPaise = (outstandingFines ?? []).reduce((s, f) => s + f.amount_paise - f.amount_paid_paise, 0);

  const waive = useMutation({
    mutationFn: (fineId: number) => call('fines:waive', { fineId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fines'] }),
    onError: (e) => setError(e.message),
  });

  const sym = settings?.currency_symbol ?? '₹';

  const q = search.trim().toLowerCase();
  const filtered = (fines ?? []).filter(
    (f) =>
      !q ||
      f.member_name.toLowerCase().includes(q) ||
      (f.title ?? '').toLowerCase().includes(q) ||
      (f.reason ?? '').toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Fines</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                status === f.key
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'text-slate-600 hover:bg-indigo-50'
              }`}
            >
              {f.label}
              {f.key === 'outstanding' && owedPaise > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    status === 'outstanding' ? 'bg-white/25 text-white' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {formatMoney(owedPaise, sym)}
                </span>
              )}
            </button>
          ))}
        </div>
        <input
          className={`${inputCls} max-w-xs flex-1`}
          placeholder="Search member, book or reason…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {q && (
          <span className="text-sm text-slate-400">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      {error && <ErrorNote error={error} />}

      {isLoading ? (
        <div className="text-slate-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          message={
            q
              ? `Nothing matches "${search.trim()}" in this filter`
              : status === 'outstanding'
                ? 'No money is owed — all fines are settled.'
                : 'No fines match this filter'
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={thCls}>Book / Reason</th>
              <th className={thCls}>Member</th>
              <th className={thCls}>Charged</th>
              <th className={`${thCls} text-right`}>Amount</th>
              <th className={`${thCls} text-right`}>Paid</th>
              <th className={`${thCls} text-right`}>Balance</th>
              <th className={thCls}>Status</th>
              <th className={thCls}></th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((f) => (
              <tr
                key={f.id}
                className="group cursor-pointer"
                onClick={() => setQuickView(f.id)}
                title="Click for fine details"
              >
                <td className={`${tdCls} border-l-2 border-transparent group-hover:border-indigo-400`}>
                  <div className="flex items-center gap-3">
                    {f.book_id ? (
                      <CoverThumb bookId={f.book_id} />
                    ) : (
                      <div className="h-10 w-7 shrink-0 rounded-sm bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      {f.book_id ? (
                        <Link
                          to={`/catalog/${f.book_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="block truncate font-semibold text-slate-800 hover:underline group-hover:text-indigo-600"
                        >
                          {f.title}
                        </Link>
                      ) : (
                        <span className="block font-semibold text-slate-500">General fine</span>
                      )}
                      <div className="truncate text-xs text-slate-500">{f.reason}</div>
                    </div>
                  </div>
                </td>
                <td className={tdCls}>
                  <Link
                    to={`/members/${f.member_id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-700 hover:text-indigo-600 hover:underline"
                  >
                    {f.member_name}
                  </Link>
                </td>
                <td className={tdCls}>{formatDate(f.created_at.slice(0, 10))}</td>
                <td className={`${tdCls} text-right text-slate-500`}>{formatMoney(f.amount_paise, sym)}</td>
                <td className={`${tdCls} text-right text-slate-500`}>
                  {f.amount_paid_paise > 0 ? (
                    formatMoney(f.amount_paid_paise, sym)
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className={`${tdCls} text-right`}>
                  {f.status === 'outstanding' ? (
                    <span className="inline-flex items-center rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-600/10 ring-inset">
                      {formatMoney(f.amount_paise - f.amount_paid_paise, sym)}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className={tdCls}><Badge value={f.status} /></td>
                <td className={`${tdCls} space-x-2 whitespace-nowrap`}>
                  {f.status === 'outstanding' && (
                    <>
                      <button
                        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaying(f);
                        }}
                      >
                        Record payment
                      </button>
                      <button
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Waive this fine?')) waive.mutate(f.id);
                        }}
                      >
                        Waive
                      </button>
                    </>
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
      {fines && fines.length >= 500 && (
        <p className="text-xs text-slate-400">
          Showing the first 500 fines — use the status filter to narrow the list.
        </p>
      )}

      {(() => {
        const open = quickView !== null ? fines?.find((f) => f.id === quickView) : undefined;
        return open ? (
          <FineQuickView
            fine={open}
            symbol={sym}
            onClose={() => setQuickView(null)}
            onRecordPayment={setPaying}
          />
        ) : null;
      })()}
      {paying && (
        <PaymentModal
          fine={paying}
          symbol={sym}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            qc.invalidateQueries();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  fine,
  symbol,
  onClose,
  onDone,
}: {
  fine: FineDetail;
  symbol: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const balance = fine.amount_paise - fine.amount_paid_paise;
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pay = useMutation({
    mutationFn: () =>
      call('fines:recordPayment', {
        fineId: fine.id,
        amountPaise: Math.round(Number(amount) * 100),
        note: note || undefined,
      }),
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title={`Record payment — ${fine.member_name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        Balance due: <b className="text-red-600">{formatMoney(balance, symbol)}</b>
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          pay.mutate();
        }}
      >
        <Field label={`Amount (${symbol})`}>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            min="0.01"
            max={(balance / 100).toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            required
          />
        </Field>
        <Field label="Note (optional)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <ErrorNote error={error} />}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={pay.isPending}>
            Record payment
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
