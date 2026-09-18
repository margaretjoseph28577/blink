import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CaretRight, X } from '@phosphor-icons/react';
import { formatDate, today } from '../api/client';
import type { LoanDetail } from '../../shared/types';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div
        className={`animate-rise max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-md'} overflow-y-auto rounded-lg bg-white p-6 shadow-2xl ring-1 ring-slate-900/5`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right-side slide-over panel — the app's quick-view pattern (books, loans, fines). */
export function SlideOver({
  title,
  onClose,
  headerExtra,
  children,
}: {
  title: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label={title}>
      <div className="absolute inset-0 bg-slate-950/30" onClick={onClose} />
      <div className="animate-slide-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <span className="text-sm font-semibold text-slate-500">{title}</span>
          <div className="flex items-center gap-1">
            {headerExtra}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/15';

export const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-indigo-500 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/25 transition hover:from-indigo-600 hover:to-indigo-700 hover:shadow-lg hover:shadow-indigo-600/30 active:scale-[.98] disabled:opacity-50 disabled:shadow-none';
export const btnSecondary =
  'inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 active:scale-[.98] disabled:opacity-50';
export const btnDanger =
  'inline-flex items-center gap-2 rounded-md bg-gradient-to-b from-rose-500 to-red-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-red-600/25 transition hover:from-red-600 hover:to-red-700 active:scale-[.98] disabled:opacity-50';

const badgeColors: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 ring-emerald-600/10',
  active: 'bg-emerald-100 text-emerald-700 ring-emerald-600/10',
  paid: 'bg-emerald-100 text-emerald-700 ring-emerald-600/10',
  on_loan: 'bg-amber-100 text-amber-700 ring-amber-600/10',
  outstanding: 'bg-amber-100 text-amber-700 ring-amber-600/10',
  suspended: 'bg-red-100 text-red-700 ring-red-600/10',
  lost: 'bg-red-100 text-red-700 ring-red-600/10',
  overdue: 'bg-red-100 text-red-700 ring-red-600/10',
  damaged: 'bg-orange-100 text-orange-700 ring-orange-600/10',
  expired: 'bg-slate-200 text-slate-600 ring-slate-600/10',
  withdrawn: 'bg-slate-200 text-slate-600 ring-slate-600/10',
  returned: 'bg-slate-200 text-slate-600 ring-slate-600/10',
  waived: 'bg-slate-200 text-slate-600 ring-slate-600/10',
  student: 'bg-blue-100 text-blue-700 ring-blue-600/10',
  staff: 'bg-purple-100 text-purple-700 ring-purple-600/10',
  book: 'bg-blue-100 text-blue-700 ring-blue-600/10',
  magazine: 'bg-purple-100 text-purple-700 ring-purple-600/10',
  cd: 'bg-cyan-100 text-cyan-700 ring-cyan-600/10',
  dvd: 'bg-orange-100 text-orange-700 ring-orange-600/10',
  reference: 'bg-slate-200 text-slate-600 ring-slate-600/10',
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeColors[value] ?? 'bg-slate-100 text-slate-600 ring-slate-600/10'}`}
    >
      {value.replace('_', ' ')}
    </span>
  );
}

/** Soft-tint icon chips — the icon carries the hue, the tile itself stays white. */
const statTones: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  sky: 'bg-sky-50 text-sky-600',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-500',
};

export function StatCard({
  label,
  value,
  icon,
  tone = 'indigo',
  accent,
  sub,
  subTone = 'slate',
  subTitle,
  to,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: keyof typeof statTones;
  accent?: boolean;
  /** Short note shown as a small badge beside the value (keeps every tile the same height) */
  sub?: ReactNode;
  subTone?: 'slate' | 'red' | 'amber';
  /** Tooltip for the badge — put the long explanation here, keep `sub` short */
  subTitle?: string;
  /** Route to open when the card is clicked */
  to?: string;
}) {
  const chip = statTones[accent ? 'red' : tone];
  const subCls = {
    slate: 'bg-slate-100 text-slate-500 ring-slate-600/10',
    red: 'bg-red-50 text-red-600 ring-red-600/10',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  }[subTone];
  const body = (
    <div className="flex items-center gap-4">
      {icon && (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${chip}`}>{icon}</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-slate-500">{label}</div>
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className={`text-[26px] leading-tight font-bold tracking-tight ${accent ? 'text-red-600' : 'text-slate-800'}`}>
            {value}
          </span>
          {sub && (
            <span
              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${subCls}`}
              title={subTitle}
            >
              {sub}
            </span>
          )}
        </div>
      </div>
      {to && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition group-hover:bg-indigo-50 group-hover:text-indigo-600">
          <CaretRight size={15} weight="bold" className="transition group-hover:translate-x-0.5" />
        </span>
      )}
    </div>
  );
  const cardCls =
    'group block rounded-lg border border-slate-200/70 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md';
  if (to) {
    return (
      <Link to={to} className={`${cardCls} cursor-pointer hover:border-indigo-200`} title={`Open ${label.toLowerCase()}`}>
        {body}
      </Link>
    );
  }
  return <div className={cardCls}>{body}</div>;
}

/** White surface with a titled header row — the dashboard panel pattern. */
export function Card({
  title,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode;
  /** Right-aligned header slot — typically a "View all" link */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Set false when the body renders its own edge-to-edge rows */
  padded?: boolean;
}) {
  return (
    <section className={`flex flex-col rounded-lg border border-slate-200/70 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          {title && <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>}
          {action}
        </div>
      )}
      <div className={`min-h-0 flex-1 ${padded ? 'px-5 pb-5' : ''}`}>{children}</div>
    </section>
  );
}

/** Small "View all →" link used in card headers. */
export function ViewAllLink({ to, children = 'View all' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="text-sm font-semibold text-indigo-600 hover:underline">
      {children}
    </Link>
  );
}

/** Due date as an urgency-coded chip: red when late, amber when due today. */
export function DueChip({ loan }: { loan: LoanDetail }) {
  if (loan.days_overdue > 0) {
    return (
      <span className="inline-block shrink-0 rounded bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-600/10 ring-inset">
        {loan.days_overdue}d late
      </span>
    );
  }
  if (loan.status === 'active' && loan.due_date === today()) {
    return (
      <span className="inline-block shrink-0 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-600/10 ring-inset">
        due today
      </span>
    );
  }
  return (
    <span className="inline-block shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
      due {formatDate(loan.due_date)}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300/80 bg-slate-50/50 py-10 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="animate-rise flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
      <span>⚠</span>
      <span>{msg}</span>
    </div>
  );
}

export const thCls =
  'bg-slate-50/80 px-3 py-2.5 text-left text-[11px] font-bold tracking-wider text-slate-500 uppercase first:rounded-tl-lg last:rounded-tr-lg';
export const tdCls = 'px-3 py-2.5 text-sm';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200/70 bg-white shadow-sm">
      <table className="w-full divide-y divide-slate-200 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-50/40">
        {children}
      </table>
    </div>
  );
}
