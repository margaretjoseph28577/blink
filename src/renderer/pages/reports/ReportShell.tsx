import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DownloadSimple, Printer } from '@phosphor-icons/react';
import { call } from '../../api/client';
import { btnPrimary, btnSecondary } from '../../components/ui';

/**
 * Common chrome for every report tab: filter row, CSV export, print button,
 * and a print-styled header with the library name.
 */
export default function ReportShell({
  title,
  subtitle,
  filters,
  onExport,
  exportDisabled,
  children,
}: {
  title: string;
  subtitle?: string;
  filters?: ReactNode;
  onExport?: () => Promise<{ savedPath: string | null }>;
  exportDisabled?: boolean;
  children: ReactNode;
}) {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="no-print flex items-end gap-3 rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm">
        {filters}
        <div className="flex-1" />
        {onExport && (
          <button
            className={btnSecondary}
            disabled={exportDisabled}
            onClick={async () => {
              const res = await onExport();
              setSavedMsg(res.savedPath ? `Saved to ${res.savedPath}` : null);
            }}
          >
            <DownloadSimple size={15} weight="bold" /> Export CSV
          </button>
        )}
        <button className={btnPrimary} onClick={() => window.print()} disabled={exportDisabled}>
          <Printer size={15} weight="fill" /> Print
        </button>
      </div>
      {savedMsg && <p className="no-print text-sm text-emerald-600">{savedMsg}</p>}

      <div className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <h2 className="mb-1 text-center text-xl font-bold">{title}</h2>
        <p className="mb-3 text-center text-sm text-slate-500 print:text-black">
          {settings?.library_name}
          {subtitle ? ` — ${subtitle}` : ''}
        </p>
        {children}
      </div>
    </div>
  );
}

export function useDateRange() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  return { fromDate, toDate, setFromDate, setToDate };
}

export function rangeLabel(fromDate: string, toDate: string): string | undefined {
  if (!fromDate && !toDate) return undefined;
  return `${fromDate || 'start'} to ${toDate || 'today'}`;
}
