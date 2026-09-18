import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { call, formatDate } from '../api/client';
import { useAuth } from '../AuthContext';
import { CoverLarge } from './CoverThumb';
import { Badge, SlideOver } from './ui';

/**
 * Slide-over quick view for a title — browse and check availability without
 * leaving the list. Librarians get a link to the full record.
 */
export default function BookQuickView({ bookId, onClose }: { bookId: number; onClose: () => void }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['book', String(bookId)],
    queryFn: () => call('books:get', { id: bookId }),
  });

  const book = data?.book;
  const copies = data?.copies ?? [];
  const available = copies.filter((c) => c.status === 'available').length;
  const usable = copies.filter((c) => !['withdrawn', 'lost'].includes(c.status)).length;

  return (
    <SlideOver
      title="Quick view"
      onClose={onClose}
      headerExtra={
        user?.role === 'librarian' && book ? (
          <Link
            to={`/catalog/${book.id}`}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
          >
            <ArrowSquareOut size={14} weight="bold" /> Full record
          </Link>
        ) : undefined
      }
    >
      {!book ? (
          <div className="p-5 text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="flex gap-4">
              <CoverLarge bookId={book.id} className="h-40 w-28 shrink-0 rounded-md shadow-md ring-1 ring-slate-900/10" />
              <div className="min-w-0">
                <h2 className="text-lg leading-snug font-bold">{book.title}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{book.authors}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge value={book.resource_type} />
                  {book.category && (
                    <span className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600 ring-1 ring-indigo-600/10 ring-inset">
                      {book.category}
                    </span>
                  )}
                  {book.year && (
                    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-600/10 ring-inset">
                      {book.year}
                    </span>
                  )}
                </div>
                <p className={`mt-3 text-sm font-semibold ${available > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {available > 0 ? `${available} of ${usable} available` : 'All copies out'}
                </p>
              </div>
            </div>

            <dl className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              {book.isbn && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">ISBN</dt>
                  <dd className="font-mono text-xs">{book.isbn}</dd>
                </div>
              )}
              {book.publisher && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Publisher</dt>
                  <dd className="truncate text-right">{book.publisher}</dd>
                </div>
              )}
              {book.edition && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Edition</dt>
                  <dd>{book.edition}</dd>
                </div>
              )}
              {book.subject && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-400">Subject</dt>
                  <dd className="truncate text-right">{book.subject}</dd>
                </div>
              )}
            </dl>

            {book.description && (
              <p className="border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600">
                {book.description.length > 400 ? `${book.description.slice(0, 400)}…` : book.description}
              </p>
            )}

            <div className="border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Copies</h3>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                {copies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono text-xs text-slate-500">{c.accession_number}</span>
                    <span className="flex items-center gap-2">
                      {c.status === 'on_loan' && c.loan_due_date && (
                        <span className="text-xs text-slate-400">due {formatDate(c.loan_due_date)}</span>
                      )}
                      <Badge value={c.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
    </SlideOver>
  );
}
