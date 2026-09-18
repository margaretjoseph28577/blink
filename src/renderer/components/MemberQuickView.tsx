import { classLabel } from '../../shared/types';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { call, formatDate, formatMoney } from '../api/client';
import CoverThumb from './CoverThumb';
import MemberAvatar from './MemberAvatar';
import { Badge, SlideOver } from './ui';

/** Slide-over for one member: who they are, what they have out, what they owe. */
export default function MemberQuickView({ memberId, onClose }: { memberId: number; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ['member', String(memberId)],
    queryFn: () => call('members:get', { id: memberId }),
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const sym = settings?.currency_symbol;

  const member = data?.member;
  const activeLoans = data?.activeLoans ?? [];
  const outstanding = (data?.fines ?? []).filter((f) => f.status === 'outstanding');
  const owedPaise = outstanding.reduce((s, f) => s + f.amount_paise - f.amount_paid_paise, 0);

  return (
    <SlideOver
      title="Member"
      onClose={onClose}
      headerExtra={
        member ? (
          <Link
            to={`/members/${member.id}`}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            <ArrowSquareOut size={14} weight="bold" /> Full profile
          </Link>
        ) : undefined
      }
    >
      {!member ? (
        <div className="p-5 text-slate-400">Loading…</div>
      ) : (
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <MemberAvatar memberId={member.id} name={member.name} size={64} />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{member.name}</h2>
              <div className="font-mono text-xs text-slate-400">
                {member.member_code}
                {member.member_type === 'student' && classLabel(member) && (
                  <span className="ml-2 font-sans font-semibold text-slate-600">Class {classLabel(member)}</span>
                )}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <Badge value={member.member_type} />
                <Badge value={member.status} />
              </div>
            </div>
          </div>

          <dl className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
            {member.member_type === 'student' && member.roll_no && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Roll no</dt>
                <dd>{member.roll_no}</dd>
              </div>
            )}
            {member.member_type === 'student' && (member.guardian_name || member.guardian_phone) && (
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-400">Guardian</dt>
                <dd className="truncate text-right">
                  {member.guardian_name}
                  {member.guardian_name && member.guardian_phone && ' · '}
                  {member.guardian_phone}
                </dd>
              </div>
            )}
            {member.email && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Email</dt>
                <dd className="truncate">{member.email}</dd>
              </div>
            )}
            {member.phone && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Phone</dt>
                <dd>{member.phone}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Joined</dt>
              <dd>{formatDate(member.join_date)}</dd>
            </div>
            {owedPaise > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-400">Fines due</dt>
                <dd className="font-semibold text-red-600">{formatMoney(owedPaise, sym)}</dd>
              </div>
            )}
          </dl>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">
              Books out ({activeLoans.length})
            </h3>
            {activeLoans.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing out right now</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {activeLoans.map((l) => (
                  <li key={l.id} className="flex items-center gap-2.5 px-3 py-2">
                    <CoverThumb bookId={l.book_id} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{l.title}</div>
                      <div className="font-mono text-[11px] text-slate-400">{l.accession_number}</div>
                    </div>
                    <span className={`shrink-0 text-xs ${l.days_overdue > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                      due {formatDate(l.due_date)}
                      {l.days_overdue > 0 && ` (${l.days_overdue}d late)`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SlideOver>
  );
}
