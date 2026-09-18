import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { useNavigate, useParams } from 'react-router-dom';
import { call, today } from '../../api/client';
import { RESOURCE_TYPES } from '../../../shared/types';
import type { BookInput, CopyInput } from '../../../shared/types';
import { ErrorNote, Field, btnPrimary, btnSecondary, inputCls } from '../../components/ui';

const emptyBook: BookInput = {
  title: '',
  authors: '',
  resource_type: 'book',
  isbn: null,
  publisher: null,
  place: null,
  year: null,
  edition: null,
  volume: null,
  pages: null,
  subject: null,
  category: null,
  description: null,
  coverDataUrl: null,
};

const emptyCopy = (): CopyInput => ({
  accession_date: today(),
  binding: null,
  source: null,
  bill_no: null,
  cost_paise: null,
  remarks: null,
  shelf_location: null,
});

export default function BookFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [book, setBook] = useState<BookInput>(emptyBook);
  const [copies, setCopies] = useState<CopyInput[]>([emptyCopy()]);
  const [isbnField, setIsbnField] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery({
    queryKey: ['book', id],
    queryFn: () => call('books:get', { id: Number(id) }),
    enabled: editing,
  });

  useEffect(() => {
    if (existing) {
      const b = existing.book;
      setBook({
        title: b.title,
        authors: b.authors,
        resource_type: b.resource_type,
        isbn: b.isbn,
        publisher: b.publisher,
        place: b.place,
        year: b.year,
        edition: b.edition,
        volume: b.volume,
        pages: b.pages,
        subject: b.subject,
        category: b.category,
        description: b.description,
      });
      setIsbnField(b.isbn ?? '');
      call('cover:read', { bookId: b.id }).then(setCover);
    }
  }, [existing]);

  const doLookup = async () => {
    if (!isbnField.trim()) return;
    setLookupBusy(true);
    setLookupMsg(null);
    try {
      const result = await call('isbn:lookup', { isbn: isbnField.trim() });
      if (!result) {
        setLookupMsg('No record found for this ISBN — enter details manually.');
      } else {
        setBook((prev) => ({
          ...prev,
          isbn: result.isbn,
          title: result.title ?? prev.title,
          authors: result.authors ?? prev.authors,
          publisher: result.publisher ?? prev.publisher,
          place: result.place ?? prev.place,
          year: result.year ?? prev.year,
          edition: result.edition ?? prev.edition,
          pages: result.pages ?? prev.pages,
          subject: result.subject ?? prev.subject,
          category: result.category ?? prev.category,
          description: result.description ?? prev.description,
          coverDataUrl: result.coverDataUrl ?? prev.coverDataUrl,
        }));
        if (result.coverDataUrl) setCover(result.coverDataUrl);
        setIsbnField(result.isbn);
        setLookupMsg(`Found via ${result.source === 'openlibrary' ? 'Open Library' : 'Google Books'} ✓`);
      }
    } catch (err) {
      setLookupMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupBusy(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...book, isbn: isbnField.trim() || null };
      if (editing) {
        await call('books:update', { id: Number(id), book: payload });
        return Number(id);
      }
      const res = await call('books:create', { book: payload, copies });
      return res.id;
    },
    onSuccess: (bookId) => {
      qc.invalidateQueries();
      navigate(`/catalog/${bookId}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  const set = (patch: Partial<BookInput>) => setBook((b) => ({ ...b, ...patch }));
  const setCopy = (i: number, patch: Partial<CopyInput>) =>
    setCopies((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">{editing ? 'Edit Book' : 'Add Book'}</h1>

      <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
        <Field label="ISBN — scan or type, then press Enter to auto-fill">
          <div className="flex gap-2">
            <input
              className={`${inputCls} max-w-xs font-mono`}
              value={isbnField}
              onChange={(e) => setIsbnField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doLookup();
                }
              }}
              placeholder="e.g. 9780140328721"
              autoFocus={!editing}
            />
            <button type="button" className={btnSecondary} onClick={doLookup} disabled={lookupBusy}>
              <MagnifyingGlass size={15} weight="bold" /> {lookupBusy ? 'Looking up…' : 'Lookup'}
            </button>
          </div>
        </Field>
        {lookupMsg && <p className="mt-2 text-sm text-slate-500">{lookupMsg}</p>}
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
          <div className="flex gap-5">
            <div className="flex-1 grid grid-cols-2 gap-4">
              <Field label="Resource type">
                <select
                  className={inputCls}
                  value={book.resource_type ?? 'book'}
                  onChange={(e) => set({ resource_type: e.target.value as BookInput['resource_type'] })}
                >
                  {RESOURCE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title *">
                <input className={inputCls} value={book.title} onChange={(e) => set({ title: e.target.value })} required />
              </Field>
              <Field label="Author(s) *" className="col-span-2">
                <input className={inputCls} value={book.authors} onChange={(e) => set({ authors: e.target.value })} required />
              </Field>
              <Field label="Publisher">
                <input className={inputCls} value={book.publisher ?? ''} onChange={(e) => set({ publisher: e.target.value || null })} />
              </Field>
              <Field label="Place of publication">
                <input className={inputCls} value={book.place ?? ''} onChange={(e) => set({ place: e.target.value || null })} />
              </Field>
              <Field label="Year">
                <input
                  className={inputCls}
                  type="number"
                  value={book.year ?? ''}
                  onChange={(e) => set({ year: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
              <Field label="Edition">
                <input className={inputCls} value={book.edition ?? ''} onChange={(e) => set({ edition: e.target.value || null })} />
              </Field>
              <Field label="Volume">
                <input className={inputCls} value={book.volume ?? ''} onChange={(e) => set({ volume: e.target.value || null })} />
              </Field>
              <Field label="Pages">
                <input className={inputCls} value={book.pages ?? ''} onChange={(e) => set({ pages: e.target.value || null })} />
              </Field>
              <Field label="Subject">
                <input className={inputCls} value={book.subject ?? ''} onChange={(e) => set({ subject: e.target.value || null })} />
              </Field>
              <Field label="Category / Genre">
                <input className={inputCls} value={book.category ?? ''} onChange={(e) => set({ category: e.target.value || null })} />
              </Field>
              <Field label="Description" className="col-span-2">
                <textarea
                  className={`${inputCls} h-20`}
                  value={book.description ?? ''}
                  onChange={(e) => set({ description: e.target.value || null })}
                />
              </Field>
            </div>
            <div className="w-36 shrink-0">
              <span className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">Cover</span>
              {cover ? (
                <img src={cover} alt="Cover" className="w-36 rounded border border-slate-200 shadow" />
              ) : (
                <div className="flex h-48 w-36 items-center justify-center rounded-md bg-indigo-50 text-slate-400 shadow-inner ring-1 ring-slate-200">
                  <BookOpen size={36} weight="duotone" />
                </div>
              )}
            </div>
          </div>
        </div>

        {!editing && (
          <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Copies to accession ({copies.length})</h2>
              <button type="button" className={btnSecondary} onClick={() => setCopies((c) => [...c, emptyCopy()])}>
                <Plus size={15} weight="bold" /> Add copy
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Accession numbers are allocated automatically when you save.
            </p>
            <div className="space-y-4">
              {copies.map((c, i) => (
                <div key={i} className="grid grid-cols-4 gap-3 rounded border border-slate-100 bg-slate-50 p-3">
                  <Field label="Accession date">
                    <input className={inputCls} type="date" value={c.accession_date} onChange={(e) => setCopy(i, { accession_date: e.target.value })} />
                  </Field>
                  <Field label="Binding">
                    <input className={inputCls} value={c.binding ?? ''} onChange={(e) => setCopy(i, { binding: e.target.value || null })} placeholder="Paperback…" />
                  </Field>
                  <Field label="Source / Vendor">
                    <input className={inputCls} value={c.source ?? ''} onChange={(e) => setCopy(i, { source: e.target.value || null })} />
                  </Field>
                  <Field label="Bill No">
                    <input className={inputCls} value={c.bill_no ?? ''} onChange={(e) => setCopy(i, { bill_no: e.target.value || null })} />
                  </Field>
                  <Field label="Cost (₹)">
                    <input
                      className={inputCls}
                      type="number"
                      step="0.01"
                      min="0"
                      value={c.cost_paise !== null ? c.cost_paise / 100 : ''}
                      onChange={(e) =>
                        setCopy(i, { cost_paise: e.target.value ? Math.round(Number(e.target.value) * 100) : null })
                      }
                    />
                  </Field>
                  <Field label="Shelf location">
                    <input className={inputCls} value={c.shelf_location ?? ''} onChange={(e) => setCopy(i, { shelf_location: e.target.value || null })} />
                  </Field>
                  <Field label="Remarks" className="col-span-2">
                    <div className="flex gap-2">
                      <input className={inputCls} value={c.remarks ?? ''} onChange={(e) => setCopy(i, { remarks: e.target.value || null })} />
                      {copies.length > 1 && (
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setCopies((cs) => cs.filter((_, j) => j !== i))}
                          aria-label="Remove copy"
                        >
                          <X size={16} weight="bold" />
                        </button>
                      )}
                    </div>
                  </Field>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <ErrorNote error={error} />}
        <div className="flex gap-3">
          <button className={btnPrimary} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Save book'}
          </button>
          <button type="button" className={btnSecondary} onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
