import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from '@phosphor-icons/react';
import { call, formatDate } from '../../api/client';
import Barcode from '../../components/Barcode';
import MemberAvatar from '../../components/MemberAvatar';
import { EmptyState, Field, btnPrimary, inputCls } from '../../components/ui';

type Mode = 'labels' | 'cards';

/** Printable barcode label sheets for copies, and member library cards. */
export default function LabelsReport() {
  const [mode, setMode] = useState<Mode>('labels');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [memberStatus, setMemberStatus] = useState('active');
  const [search, setSearch] = useState('');

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const { data: copies } = useQuery({
    queryKey: ['labels-copies', fromDate, toDate],
    queryFn: () =>
      call('reports:accessionRegister', {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
    enabled: mode === 'labels',
  });
  const { data: members } = useQuery({
    queryKey: ['labels-members', memberStatus],
    queryFn: () => call('members:list', { status: memberStatus || undefined }),
    enabled: mode === 'cards',
  });

  const libraryName = settings?.library_name ?? 'Library';

  const q = search.trim().toLowerCase();
  const filteredCopies = (copies ?? []).filter(
    (c) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.accession_number.toLowerCase().includes(q) ||
      (c.authors ?? '').toLowerCase().includes(q),
  );
  const filteredMembers = (members ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q),
  );

  return (
    <div className="space-y-4">
      <div className="no-print flex items-end gap-3 rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
        <Field label="Print">
          <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="labels">Book labels (accession barcodes)</option>
            <option value="cards">Member library cards</option>
          </select>
        </Field>
        {mode === 'labels' ? (
          <>
            <Field label="Accessioned from">
              <input className={inputCls} type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </Field>
            <Field label="To">
              <input className={inputCls} type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Member status">
            <select className={inputCls} value={memberStatus} onChange={(e) => setMemberStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="">All</option>
            </select>
          </Field>
        )}
        <Field label="Search" className="min-w-48 flex-1">
          <input
            className={inputCls}
            placeholder={mode === 'labels' ? 'Title, author or accession no…' : 'Name or member ID…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <button className={btnPrimary} onClick={() => window.print()}>
          <Printer size={15} weight="fill" /> Print{' '}
          {mode === 'labels'
            ? `${filteredCopies.length} label${filteredCopies.length === 1 ? '' : 's'}`
            : `${filteredMembers.length} card${filteredMembers.length === 1 ? '' : 's'}`}
        </button>
      </div>
      <p className="no-print text-xs text-slate-400">
        {mode === 'labels'
          ? 'Stick a label inside each book cover — circulation and stock verification then work with any USB barcode scanner. Use the date filter to print labels for newly accessioned books only.'
          : 'One card per member. Scan the card at issue instead of typing — the barcode encodes the member ID.'}
      </p>

      {mode === 'labels' ? (
        filteredCopies.length === 0 ? (
          <EmptyState message={q ? `Nothing matches "${search.trim()}"` : 'No copies in this date range'} />
        ) : (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200/70 bg-white p-3 shadow-sm print:gap-1 print:rounded-none print:border-0 print:p-0 print:shadow-none">
            {filteredCopies.map((c) => (
              <div
                key={c.accession_number}
                className="flex flex-col items-center justify-between overflow-hidden rounded border border-slate-300 px-2 py-1.5 text-center break-inside-avoid"
              >
                <div className="w-full truncate text-[9px] font-bold tracking-wide uppercase">{libraryName}</div>
                <Barcode value={c.accession_number} height={30} unit={1.4} />
                <div className="w-full truncate text-[9px] text-slate-600">{c.title}</div>
              </div>
            ))}
          </div>
        )
      ) : filteredMembers.length === 0 ? (
        <EmptyState message={q ? `Nothing matches "${search.trim()}"` : 'No members match'} />
      ) : (
        <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm print:gap-3 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {filteredMembers.map((m) => (
            // Standard CR80 ID-card size: 85.6mm × 54mm.
            <div
              key={m.id}
              className="flex h-[54mm] w-[85.6mm] shrink-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md break-inside-avoid"
            >
              <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#16294a] to-[#23406b] px-3 py-1.5">
                <span className="truncate text-[10px] font-bold tracking-wide text-white uppercase">
                  {libraryName}
                </span>
                <span className="shrink-0 text-[8px] font-semibold tracking-[0.18em] text-indigo-200 uppercase">
                  Library Card
                </span>
              </div>
              <div className="flex flex-1 items-center gap-3 px-3">
                <MemberAvatar memberId={m.id} name={m.name} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] leading-tight font-bold text-slate-900">{m.name}</div>
                  <div className="font-mono text-[10px] font-semibold text-indigo-700">{m.member_code}</div>
                  <div className="mt-0.5 text-[8px] leading-snug text-slate-400">
                    <div>Member since {formatDate(m.join_date)}</div>
                    {m.phone && <div>{m.phone}</div>}
                  </div>
                </div>
              </div>
              <div className="flex justify-center border-t border-slate-100 bg-slate-50/80 py-1">
                <Barcode value={m.member_code} height={18} unit={1.1} />
              </div>
              <div className="h-[5px] shrink-0 bg-gradient-to-r from-indigo-500 via-[#16294a] to-indigo-500" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
