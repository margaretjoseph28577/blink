import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Coins, HandCoins } from '@phosphor-icons/react';
import { call, formatDate, formatMoney } from '../api/client';
import type { FineDetail } from '../../shared/types';
import { CoverLarge } from './CoverThumb';
import MemberAvatar from './MemberAvatar';
import { Badge, ErrorNote, SlideOver, btnPrimary, btnSecondary } from './ui';

/** Slide-over for one fine: who owes what for which book, with settle actions. */
export default function FineQuickView({
  fine,
  symbol,
  onClose,
  onRecordPayment,
}: {
  fine: FineDetail;
  symbol?: string;
  onClose: () => void;
  onRecordPayment: (fine: FineDetail) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const waive = useMutation({
    mutationFn: () => call('fines:waive', { fineId: fine.id }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries();
    },
    onError: (e) => setError(e.message),
  });

  const balance = fine.amount_paise - fine.amount_paid_paise;

  return (
    <SlideOver title="Fine details" onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="rounded-lg border border-slate-200/70 bg-slate-50 p-4 text-center">
          <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {fine.status === 'outstanding' ? 'Balance due' : `Fine ${fine.status}`}
          </div>
          <div className={`mt-1 text-3xl font-bold tracking-tight ${fine.status === 'outstanding' ? 'text-red-600' : 'text-slate-800'}`}>
            {formatMoney(fine.status === 'outstanding' ? balance : fine.amount_paise, symbol)}
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-500">
            <span>Amount {formatMoney(fine.amount_paise, symbol)}</span>
            <span>·</span>
            <span>Paid {formatMoney(fine.amount_paid_paise, symbol)}</span>
            <Badge value={fine.status} />
          </div>
        </div>

        <Link
          to={`/members/${fine.member_id}`}
          className="flex items-center gap-3 rounded-lg border border-slate-200/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          <MemberAvatar memberId={fine.member_id} name={fine.member_name} size={36} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{fine.member_name}</div>
            <div className="font-mono text-xs text-slate-400">{fine.member_code}</div>
          </div>
        </Link>

        {fine.book_id && (
          <Link
            to={`/catalog/${fine.book_id}`}
            className="flex items-center gap-3 rounded-lg border border-slate-200/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
          >
            <CoverLarge bookId={fine.book_id} className="h-14 w-10 shrink-0 rounded-sm ring-1 ring-slate-900/10" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{fine.title}</div>
              {fine.accession_number && (
                <div className="font-mono text-xs text-slate-400">{fine.accession_number}</div>
              )}
            </div>
          </Link>
        )}

        <div className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Reason</span>
            <span className="text-right">{fine.reason ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Charged on</span>
            <span>{formatDate(fine.created_at.slice(0, 10))}</span>
          </div>
        </div>

        {error && <ErrorNote error={error} />}

        {fine.status === 'outstanding' && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <button className={`${btnPrimary} w-full justify-center`} onClick={() => onRecordPayment(fine)}>
              <HandCoins size={15} weight="fill" /> Record payment
            </button>
            <button
              className={`${btnSecondary} w-full justify-center`}
              onClick={() => {
                if (confirm('Waive this fine? The balance will be written off.')) waive.mutate();
              }}
              disabled={waive.isPending}
            >
              <Coins size={15} weight="fill" /> Waive fine
            </button>
          </div>
        )}
      </div>
    </SlideOver>
  );
}
