import {
  ArrowCounterClockwise,
  ArrowSquareIn,
  ArrowSquareOut,
  Books,
  Coins,
  FloppyDisk,
  Key,
  Package,
  PencilSimple,
  Plus,
  SignIn,
  SignOut,
  Tag,
  Trash,
  UploadSimple,
  UserPlus,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { ActivityRow } from '../../shared/types';
import { formatDateTime, timeAgo } from '../api/client';

export const activityMeta: Record<string, { icon: Icon; chip: string; label: string }> = {
  checkout: { icon: ArrowSquareOut, chip: 'bg-purple-100 text-purple-600', label: 'Issued' },
  checkin: { icon: ArrowSquareIn, chip: 'bg-emerald-100 text-emerald-600', label: 'Returned' },
  renew: { icon: ArrowCounterClockwise, chip: 'bg-sky-100 text-sky-600', label: 'Renewed' },
  renew_undo: { icon: ArrowCounterClockwise, chip: 'bg-amber-100 text-amber-600', label: 'Renewal undone' },
  book_add: { icon: Books, chip: 'bg-blue-100 text-blue-600', label: 'Book added' },
  book_edit: { icon: PencilSimple, chip: 'bg-slate-100 text-slate-500', label: 'Book edited' },
  book_delete: { icon: Trash, chip: 'bg-red-100 text-red-600', label: 'Book deleted' },
  copy_add: { icon: Tag, chip: 'bg-cyan-100 text-cyan-600', label: 'Copy accessioned' },
  copy_remove: { icon: Trash, chip: 'bg-orange-100 text-orange-600', label: 'Copy removed' },
  member_add: { icon: UserPlus, chip: 'bg-emerald-100 text-emerald-600', label: 'Member registered' },
  member_edit: { icon: PencilSimple, chip: 'bg-slate-100 text-slate-500', label: 'Member updated' },
  member_delete: { icon: Trash, chip: 'bg-red-100 text-red-600', label: 'Member deleted' },
  member_login: { icon: Key, chip: 'bg-slate-100 text-slate-500', label: 'Login created' },
  fine_payment: { icon: Coins, chip: 'bg-emerald-100 text-emerald-600', label: 'Fine collected' },
  fine_waive: { icon: Coins, chip: 'bg-slate-100 text-slate-500', label: 'Fine waived' },
  stock_begin: { icon: Package, chip: 'bg-amber-100 text-amber-600', label: 'Stock check started' },
  stock_lost: { icon: Package, chip: 'bg-red-100 text-red-600', label: 'Marked lost' },
  import: { icon: UploadSimple, chip: 'bg-blue-100 text-blue-600', label: 'CSV import' },
  backup: { icon: FloppyDisk, chip: 'bg-slate-100 text-slate-500', label: 'Backup' },
  restore: { icon: FloppyDisk, chip: 'bg-red-100 text-red-600', label: 'Restore' },
  staff_add: { icon: UserPlus, chip: 'bg-emerald-100 text-emerald-600', label: 'Staff added' },
  staff_edit: { icon: Key, chip: 'bg-slate-100 text-slate-500', label: 'Staff updated' },
  login: { icon: SignIn, chip: 'bg-slate-100 text-slate-400', label: 'Signed in' },
  logout: { icon: SignOut, chip: 'bg-slate-100 text-slate-400', label: 'Signed out' },
  default: { icon: Plus, chip: 'bg-slate-100 text-slate-500', label: 'Activity' },
};

export function ActivityList({ items }: { items: ActivityRow[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => {
        const meta = activityMeta[a.action] ?? activityMeta.default;
        return (
          <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${meta.chip}`}>
              <meta.icon size={16} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-slate-700" title={a.detail}>
                {a.detail}
              </div>
              <div className="text-xs text-slate-400">
                {meta.label}
                {a.username ? ` · by ${a.username}` : ''}
              </div>
            </div>
            <span className="shrink-0 text-xs text-slate-400" title={formatDateTime(a.at)}>
              {timeAgo(a.at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
