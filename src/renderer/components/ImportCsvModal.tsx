import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { call } from '../api/client';
import type { ImportResult } from '../../shared/types';
import { ErrorNote, Modal, btnPrimary, btnSecondary } from './ui';

interface ImportConfig {
  title: string;
  /** Explains the expected file layout, shown at the top of the modal. */
  description: ReactNode;
  templateFilename: string;
  templateHeaders: string[];
  templateRows: (string | number | null)[][];
  /** Runs the import through the section's IPC channel. */
  run: (csvText: string, dryRun: boolean) => Promise<ImportResult>;
  /** [singular, plural] for the main record, e.g. ['title', 'titles'] */
  primaryNoun: [string, string];
  /** [singular, plural] for the related record (copies, logins); omit when not applicable */
  secondaryNoun?: [string, string];
}

/** "Import CSV" button + the whole pick → preview → confirm flow. */
export function ImportCsvButton(props: ImportConfig) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`${btnSecondary} shrink-0 whitespace-nowrap`} onClick={() => setOpen(true)}>
        <UploadSimple size={16} weight="bold" /> Import CSV
      </button>
      {open && <ImportCsvModal {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function counts(r: ImportResult, primary: [string, string], secondary?: [string, string]) {
  const p = `${r.primary} ${r.primary === 1 ? primary[0] : primary[1]}`;
  if (!secondary || r.secondary === 0) return p;
  return `${p}, ${r.secondary} ${r.secondary === 1 ? secondary[0] : secondary[1]}`;
}

function ImportCsvModal({
  title,
  description,
  templateFilename,
  templateHeaders,
  templateRows,
  run,
  primaryNoun,
  secondaryNoun,
  onClose,
}: ImportConfig & { onClose: () => void }) {
  const qc = useQueryClient();
  const [csvText, setCsvText] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    setError(null);
    try {
      const picked = await call('import:pickCsv');
      if (!picked) return;
      setBusy(true);
      setCsvText(picked.csvText);
      setFilename(picked.filename);
      setResult(null);
      setPreview(await run(picked.csvText, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!csvText) return;
    setError(null);
    setBusy(true);
    try {
      setResult(await run(csvText, false));
      qc.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () =>
    call('reports:exportCsv', {
      filename: templateFilename,
      headers: templateHeaders,
      rows: templateRows,
    });

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">{description}</p>
        <div className="flex gap-2">
          <button className={btnSecondary} onClick={downloadTemplate}>
            <DownloadSimple size={15} weight="bold" /> Download template
          </button>
          <button className={btnPrimary} onClick={pickFile} disabled={busy}>
            <UploadSimple size={15} weight="bold" /> Choose CSV file…
          </button>
        </div>

        {error && <ErrorNote error={error} />}

        {preview && !result && (
          <div className="space-y-3 rounded-lg border border-slate-200/70 bg-slate-50 p-4">
            <p className="text-sm">
              <b>{filename}</b> — {counts(preview, primaryNoun, secondaryNoun)}
              {preview.errors.length > 0 && (
                <span className="font-semibold text-red-600">
                  {' '}— {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} found
                </span>
              )}
            </p>
            {preview.errors.length > 0 ? (
              <>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-red-700">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      Line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-slate-500">
                  Fix these rows in the file, then choose it again. Nothing has been imported.
                </p>
              </>
            ) : (
              <button className={btnPrimary} onClick={runImport} disabled={busy || preview.primary === 0}>
                {busy ? 'Importing…' : `Import ${counts(preview, primaryNoun, secondaryNoun)}`}
              </button>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p>
              Imported <b>{counts(result, primaryNoun, secondaryNoun)}</b>.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-red-700">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
