import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { call, formatDate, formatMoney, today } from '../../api/client';
import type { CopyInput } from '../../../shared/types';
import {
  Badge, EmptyState, ErrorNote, Field, Modal, Table,
  btnDanger, btnPrimary, btnSecondary, inputCls, tdCls, thCls,
} from '../../components/ui';

export default function BookDetailPage() {
  const { id } = useParams();
  const bookId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cover, setCover] = useState<string | null>(null);
  const [addingCopy, setAddingCopy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['book', id],
    queryFn: () => call('books:get', { id: bookId }),
  });

  useEffect(() => {
    call('cover:read', { bookId }).then(setCover).catch(() => setCover(null));
  }, [bookId]);

  const del = useMutation({
    mutationFn: () => call('books:delete', { id: bookId }),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate('/catalog');
    },
    onError: (e) => setError(e.message),
  });

  const removeCopy = useMutation({
    mutationFn: (copyId: number) => call('copies:remove', { id: copyId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['book', id] }),
    onError: (e) => setError(e.message),
  });

  const setCopyStatus = useMutation({
    mutationFn: (p: { copyId: number; status: 'available' | 'lost' | 'damaged' | 'withdrawn' }) =>
      call('copies:update', { id: p.copyId, copy: { status: p.status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['book', id] }),
    onError: (e) => setError(e.message),
  });

  if (isLoading || !data) return <div className="text-slate-400">Loading…</div>;
  const { book, copies, loanHistory } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex gap-5">
          {cover ? (
            <img src={cover} alt="Cover" className="w-28 rounded-md shadow-lg ring-1 ring-slate-900/10" />
          ) : (
            <div className="flex h-40 w-28 items-center justify-center rounded-md bg-indigo-50 text-slate-400 shadow-inner ring-1 ring-slate-200">
              <BookOpen size={32} weight="duotone" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold">{book.title}</h1>
            <p className="text-slate-600">{book.authors}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-slate-500">
              {book.isbn && <div>ISBN: <span className="font-mono">{book.isbn}</span></div>}
              {book.publisher && <div>Publisher: {book.publisher}</div>}
              {book.place && <div>Place: {book.place}</div>}
              {book.year && <div>Year: {book.year}</div>}
              {book.edition && <div>Edition: {book.edition}</div>}
              {book.volume && <div>Volume: {book.volume}</div>}
              {book.pages && <div>Pages: {book.pages}</div>}
              {book.subject && <div>Subject: {book.subject}</div>}
              {book.category && <div>Category: {book.category}</div>}
            </dl>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/catalog/${book.id}/edit`} className={btnSecondary}>
            <PencilSimple size={15} weight="fill" /> Edit
          </Link>
          <button
            className={btnDanger}
            onClick={() => {
              if (confirm(`Delete "${book.title}" and all its copies?`)) del.mutate();
            }}
          >
            <Trash size={15} weight="fill" /> Delete
          </button>
        </div>
      </div>

      {error && <ErrorNote error={error} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Copies ({copies.length})</h2>
          <button className={btnPrimary} onClick={() => setAddingCopy(true)}>
            <Plus size={16} weight="bold" /> Accession copy
          </button>
        </div>
        {copies.length === 0 ? (
          <EmptyState message="No copies accessioned yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Accession No</th>
                <th className={thCls}>Date</th>
                <th className={thCls}>Binding</th>
                <th className={`${thCls} text-right`}>Cost</th>
                <th className={thCls}>Shelf</th>
                <th className={thCls}>Status</th>
                <th className={thCls}>Borrower</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {copies.map((c) => (
                <tr key={c.id}>
                  <td className={`${tdCls} font-mono font-medium`}>{c.accession_number}</td>
                  <td className={tdCls}>{formatDate(c.accession_date)}</td>
                  <td className={tdCls}>{c.binding ?? '—'}</td>
                  <td className={`${tdCls} text-right`}>{formatMoney(c.cost_paise)}</td>
                  <td className={tdCls}>{c.shelf_location ?? '—'}</td>
                  <td className={tdCls}><Badge value={c.status} /></td>
                  <td className={tdCls}>
                    {c.borrower_name ? (
                      <span>
                        {c.borrower_name}{' '}
                        <span className="text-xs text-slate-400">(due {formatDate(c.loan_due_date)})</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${tdCls} space-x-2 whitespace-nowrap`}>
                    {c.status === 'available' && (
                      <>
                        <button
                          className="text-xs text-amber-600 hover:underline"
                          onClick={() => setCopyStatus.mutate({ copyId: c.id, status: 'damaged' })}
                        >
                          Damaged
                        </button>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeCopy.mutate(c.id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {(c.status === 'damaged' || c.status === 'lost' || c.status === 'withdrawn') && (
                      <button
                        className="text-xs text-emerald-600 hover:underline"
                        onClick={() => setCopyStatus.mutate({ copyId: c.id, status: 'available' })}
                      >
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Loan history</h2>
        {loanHistory.length === 0 ? (
          <EmptyState message="Never been borrowed" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Accession No</th>
                <th className={thCls}>Member</th>
                <th className={thCls}>Out</th>
                <th className={thCls}>Due</th>
                <th className={thCls}>Returned</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loanHistory.map((l) => (
                <tr key={l.id}>
                  <td className={`${tdCls} font-mono`}>{l.accession_number}</td>
                  <td className={tdCls}>
                    <Link to={`/members/${l.member_id}`} className="text-indigo-600 hover:underline">
                      {l.member_name}
                    </Link>
                  </td>
                  <td className={tdCls}>{formatDate(l.checkout_date)}</td>
                  <td className={tdCls}>{formatDate(l.due_date)}</td>
                  <td className={tdCls}>{formatDate(l.return_date)}</td>
                  <td className={tdCls}>
                    <Badge value={l.days_overdue > 0 && l.status === 'active' ? 'overdue' : l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {addingCopy && (
        <AddCopyModal
          bookId={book.id}
          onClose={() => setAddingCopy(false)}
          onDone={() => {
            setAddingCopy(false);
            qc.invalidateQueries({ queryKey: ['book', id] });
          }}
        />
      )}
    </div>
  );
}

function AddCopyModal({
  bookId,
  onClose,
  onDone,
}: {
  bookId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [copy, setCopy] = useState<CopyInput>({
    accession_date: today(),
    binding: null,
    source: null,
    bill_no: null,
    cost_paise: null,
    remarks: null,
    shelf_location: null,
  });
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => call('copies:add', { bookId, copy }),
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  const set = (patch: Partial<CopyInput>) => setCopy((c) => ({ ...c, ...patch }));

  return (
    <Modal title="Accession a copy" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Accession date">
            <input className={inputCls} type="date" value={copy.accession_date} onChange={(e) => set({ accession_date: e.target.value })} />
          </Field>
          <Field label="Binding">
            <input className={inputCls} value={copy.binding ?? ''} onChange={(e) => set({ binding: e.target.value || null })} />
          </Field>
          <Field label="Source / Vendor">
            <input className={inputCls} value={copy.source ?? ''} onChange={(e) => set({ source: e.target.value || null })} />
          </Field>
          <Field label="Bill No">
            <input className={inputCls} value={copy.bill_no ?? ''} onChange={(e) => set({ bill_no: e.target.value || null })} />
          </Field>
          <Field label="Cost (₹)">
            <input
              className={inputCls}
              type="number"
              step="0.01"
              min="0"
              value={copy.cost_paise !== null ? copy.cost_paise / 100 : ''}
              onChange={(e) => set({ cost_paise: e.target.value ? Math.round(Number(e.target.value) * 100) : null })}
            />
          </Field>
          <Field label="Shelf location">
            <input className={inputCls} value={copy.shelf_location ?? ''} onChange={(e) => set({ shelf_location: e.target.value || null })} />
          </Field>
          <Field label="Remarks" className="col-span-2">
            <input className={inputCls} value={copy.remarks ?? ''} onChange={(e) => set({ remarks: e.target.value || null })} />
          </Field>
        </div>
        {error && <ErrorNote error={error} />}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={add.isPending}>
            Accession
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
