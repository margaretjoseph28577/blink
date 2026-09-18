import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowCounterClockwise, ArrowSquareIn, CalendarBlank } from '@phosphor-icons/react';
import { call, formatDate, formatMoney } from '../api/client';
import type { LoanDetail } from '../../shared/types';
import { CoverLarge } from './CoverThumb';
import MemberAvatar from './MemberAvatar';
import { Badge, ErrorNote, SlideOver, btnPrimary, btnSecondary } from './ui';

/** Slide-over for one loan: book, borrower, timeline, and circulation actions. */
export default function LoanQuickView({ loan, onClose }: { loan: LoanDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });

  const act = (fn: () => Promise<unknown>) =>
    fn()
      .then(() => {
        setError(null);
        qc.invalidateQueries();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  const returnBook = useMutation({
    mutationFn: () => act(() => call('circ:checkin', { accessionNumber: loan.accession_number })),
  });
  const renew = useMutation({ mutationFn: () => act(() => call('circ:renew', { loanId: loan.id })) });
  const unrenew = useMutation({ mutationFn: () => act(() => call('circ:unrenew', { loanId: loan.id })) });

  const overdue = loan.status === 'active' && loan.days_overdue > 0;
  const maxRenewals = settings?.max_renewals;
  const sym = settings?.currency_symbol;

  return (
    <SlideOver title="Loan details" onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="flex gap-4">
          <CoverLarge bookId={loan.book_id} className="h-32 w-22 shrink-0 rounded-md shadow-md ring-1 ring-slate-900/10" />
          <div className="min-w-0">
            <Link to={`/catalog/${loan.book_id}`} className="text-lg leading-snug font-bold hover:text-indigo-600">
              {loan.title}
            </Link>
            <p className="mt-0.5 text-sm text-slate-500">{loan.authors}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{loan.accession_number}</p>
            <div className="mt-2">
              <Badge value={overdue ? 'overdue' : loan.status} />
            </div>
          </div>
        </div>

        <Link
          to={`/members/${loan.member_id}`}
          className="flex items-center gap-3 rounded-lg border border-slate-200/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
        >
          <MemberAvatar memberId={loan.member_id} name={loan.member_name} size={36} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{loan.member_name}</div>
            <div className="font-mono text-xs text-slate-400">{loan.member_code}</div>
          </div>
        </Link>

        <div className="space-y-2.5 border-t border-slate-100 pt-4">
          <TimelineRow icon={<CalendarBlank size={14} weight="fill" />} label="Issued" value={formatDate(loan.checkout_date)} />
          <TimelineRow
            icon={<CalendarBlank size={14} weight="fill" />}
            label="Due"
            value={
              <span className={overdue ? 'font-semibold text-red-600' : ''}>
                {formatDate(loan.due_date)}
                {overdue && ` — ${loan.days_overdue} day(s) late`}
              </span>
            }
          />
          {loan.return_date && (
            <TimelineRow icon={<ArrowSquareIn size={14} weight="fill" />} label="Returned" value={formatDate(loan.return_date)} />
          )}
          <TimelineRow
            icon={<ArrowCounterClockwise size={14} weight="fill" />}
            label="Renewals used"
            value={`${loan.renewals_count}${maxRenewals !== undefined ? ` of ${maxRenewals}` : ''}`}
          />
          {loan.accruing_fine_paise > 0 && (
            <TimelineRow
              icon={<span className="text-xs font-bold">{sym ?? '₹'}</span>}
              label={loan.status === 'active' ? 'Fine accruing' : 'Fine charged'}
              value={<span className="font-semibold text-red-600">{formatMoney(loan.accruing_fine_paise, sym)}</span>}
            />
          )}
        </div>

        {error && <ErrorNote error={error} />}

        {loan.status === 'active' && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <button
              className={`${btnPrimary} w-full justify-center`}
              onClick={() => returnBook.mutate()}
              disabled={returnBook.isPending}
            >
              <ArrowSquareIn size={15} weight="fill" /> Return book
            </button>
            <div className="flex gap-2">
              <button
                className={`${btnSecondary} flex-1 justify-center`}
                onClick={() => renew.mutate()}
                disabled={renew.isPending || overdue || (maxRenewals !== undefined && loan.renewals_count >= maxRenewals)}
                title={
                  overdue
                    ? 'Overdue loans cannot be renewed'
                    : maxRenewals !== undefined && loan.renewals_count >= maxRenewals
                      ? 'Renewal limit reached'
                      : 'Extend the due date by one loan period'
                }
              >
                Renew
              </button>
              {loan.renewals_count > 0 && (
                <button
                  className={`${btnSecondary} flex-1 justify-center`}
                  onClick={() => unrenew.mutate()}
                  disabled={unrenew.isPending}
                  title="Undo one renewal (rolls the due date back)"
                >
                  Undo renewal
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </SlideOver>
  );
}

function TimelineRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
        {icon}
      </span>
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-right">{value}</span>
    </div>
  );
}
