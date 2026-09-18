import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Rows, SquaresFour } from '@phosphor-icons/react';
import { call } from '../../api/client';
import { RESOURCE_TYPES } from '../../../shared/types';
import BookQuickView from '../../components/BookQuickView';
import CoverThumb from '../../components/CoverThumb';
import { AvailabilityMeter, BookGrid } from '../catalog/CatalogListPage';
import { Badge, EmptyState, Table, inputCls, tdCls, thCls } from '../../components/ui';

type View = 'grid' | 'table';

function initialView(): View {
  try {
    return localStorage.getItem('opac-view') === 'table' ? 'table' : 'grid';
  } catch {
    return 'grid';
  }
}

/** Read-only catalog search — used by member (OPAC) role and available to librarians. */
export default function OpacPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [view, setView] = useState<View>(initialView);
  const [quickView, setQuickView] = useState<number | null>(null);

  const switchView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('opac-view', v);
    } catch {
      /* no-op */
    }
  };

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => call('books:categories'),
  });
  const { data } = useQuery({
    queryKey: ['opac', search, category, resourceType],
    queryFn: () => call('books:list', { search, category, resourceType, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">Search the Catalog</h1>
      <div className="flex gap-3">
        <input
          className={inputCls}
          placeholder="Search by title, author, subject or ISBN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <select className={`${inputCls} max-w-48`} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select className={`${inputCls} max-w-36`} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
          <option value="">All types</option>
          {RESOURCE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-300 shadow-sm">
          <button
            className={`px-3 py-2 transition ${view === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            onClick={() => switchView('grid')}
            title="Tile view"
          >
            <SquaresFour size={16} weight="bold" />
          </button>
          <button
            className={`px-3 py-2 transition ${view === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            onClick={() => switchView('table')}
            title="Details view"
          >
            <Rows size={16} weight="bold" />
          </button>
        </div>
      </div>

      {!data || data.rows.length === 0 ? (
        <EmptyState message="No books found" />
      ) : view === 'grid' ? (
        <BookGrid rows={data.rows} onOpen={setQuickView} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th className={thCls}>Title</th>
              <th className={thCls}>Type</th>
              <th className={thCls}>Subject</th>
              <th className={thCls}>Year</th>
              <th className={thCls}>Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((b) => (
              <tr
                key={b.id}
                className="group cursor-pointer"
                onClick={() => setQuickView(b.id)}
                title="Click for details"
              >
                <td className={`${tdCls} border-l-2 border-transparent group-hover:border-indigo-400`}>
                  <div className="flex items-center gap-3">
                    <CoverThumb bookId={b.id} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800 group-hover:text-indigo-600">
                        {b.title}
                      </div>
                      <div className="truncate text-xs text-slate-500">{b.authors}</div>
                    </div>
                  </div>
                </td>
                <td className={tdCls}>
                  <Badge value={b.resource_type} />
                </td>
                <td className={tdCls}>
                  {b.subject ?? b.category ?? <span className="text-slate-300">—</span>}
                </td>
                <td className={tdCls}>{b.year ?? <span className="text-slate-300">—</span>}</td>
                <td className={tdCls}>
                  <AvailabilityMeter available={b.available_copies} total={b.total_copies} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {quickView !== null && <BookQuickView bookId={quickView} onClose={() => setQuickView(null)} />}
    </div>
  );
}
