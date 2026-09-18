import { Link, useSearchParams } from 'react-router-dom';
import {
  Alarm,
  ArrowsLeftRight,
  Barcode,
  Books,
  Notebook,
  Package,
  Receipt,
  TrendUp,
} from '@phosphor-icons/react';
import { btnSecondary } from '../../components/ui';
import AccessionRegisterReport from './AccessionRegisterReport';
import CirculationReport from './CirculationReport';
import OverdueReport from './OverdueReport';
import FineCollectionsReport from './FineCollectionsReport';
import CollectionSummaryReport from './CollectionSummaryReport';
import PopularReport from './PopularReport';
import LabelsReport from './LabelsPage';

const TABS = [
  { key: 'accession', label: 'Accession Register', icon: Notebook, color: 'text-blue-500', component: AccessionRegisterReport },
  { key: 'circulation', label: 'Circulation', icon: ArrowsLeftRight, color: 'text-purple-500', component: CirculationReport },
  { key: 'overdue', label: 'Overdue', icon: Alarm, color: 'text-rose-500', component: OverdueReport },
  { key: 'collections', label: 'Fine Collections', icon: Receipt, color: 'text-emerald-500', component: FineCollectionsReport },
  { key: 'summary', label: 'Collection Summary', icon: Books, color: 'text-orange-500', component: CollectionSummaryReport },
  { key: 'popular', label: 'Most Borrowed', icon: TrendUp, color: 'text-cyan-500', component: PopularReport },
  { key: 'labels', label: 'Labels & Cards', icon: Barcode, color: 'text-slate-500', component: LabelsReport },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function ReportsPage() {
  // The URL is the source of truth so other pages can deep-link, e.g. /reports?tab=summary.
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get('tab') as TabKey | null;
  const tab: TabKey = param && TABS.some((t) => t.key === param) ? param : 'accession';
  const setTab = (t: TabKey) => setSearchParams(t === 'accession' ? {} : { tab: t });
  const Active = (TABS.find((t) => t.key === tab) ?? TABS[0]).component;

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Link to="/reports/stock" className={btnSecondary}>
          <Package size={15} weight="fill" /> Stock Verification
        </Link>
      </div>
      <div className="no-print flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 hover:bg-indigo-50'
            }`}
          >
            <t.icon size={16} weight="fill" className={tab === t.key ? '' : t.color} />
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
