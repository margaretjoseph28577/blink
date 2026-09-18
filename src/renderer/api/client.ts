import type { IpcChannel, IpcEnvelope, IpcReq, IpcRes } from '../../shared/ipc-contract';

declare global {
  interface Window {
    api: { invoke: (channel: string, payload: unknown) => Promise<IpcEnvelope<unknown>> };
  }
}

/** Typed IPC call — throws Error(message) on failure so react-query can surface it. */
export async function call<C extends IpcChannel>(
  channel: C,
  ...args: IpcReq<C> extends void ? [] : [IpcReq<C>]
): Promise<IpcRes<C>> {
  const envelope = await window.api.invoke(channel, args[0]);
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data as IpcRes<C>;
}

export function formatMoney(paise: number | null | undefined, symbol = '₹'): string {
  if (paise === null || paise === undefined) return '—';
  return `${symbol}${(paise / 100).toFixed(2)}`;
}

/** Local calendar date as YYYY-MM-DD (never UTC — dates would shift near midnight). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-08-29" → "29 Aug 2026". Falls back to the raw string if unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length > 10 ? iso.replace(' ', 'T') : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Relative time for feeds: "just now", "25 min ago", "3 hr ago", "2 days ago", else a date. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(iso.slice(0, 10));
}

/** "2026-08-29 14:05:00" → "29 Aug 2026, 2:05 pm". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
