import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, FloppyDisk, FolderOpen, Key, UserPlus } from '@phosphor-icons/react';
import { call } from './../api/client';
import { useAuth } from '../AuthContext';
import type { Settings, StaffUser } from '../../shared/types';
import {
  Badge, ErrorNote, Field, Modal, btnDanger, btnPrimary, btnSecondary, inputCls,
} from './../components/ui';

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const [form, setForm] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => call('settings:update', { patch }),
    onSuccess: (updated) => {
      setForm(updated);
      setMsg('Settings saved ✓');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setError(e.message),
  });

  const backup = useMutation({
    mutationFn: () => call('backup:run'),
    onSuccess: (res) => setMsg(res.savedPath ? `Backup saved to ${res.savedPath}` : null),
    onError: (e) => setError(e.message),
  });

  const setBackupDir = useMutation({
    mutationFn: async (dir: string | null) => {
      // null = open the folder picker; '' = clear
      const path = dir ?? (await call('backup:pickDir')).path;
      if (path === null) return null;
      return call('settings:update', { patch: { backup_dir: path } });
    },
    onSuccess: (updated) => {
      if (!updated) return;
      setForm(updated);
      setMsg(updated.backup_dir ? 'Automatic backups enabled ✓' : 'Automatic backups disabled');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e) => setError(e.message),
  });

  const restore = useMutation({
    mutationFn: () => call('backup:restore'),
    onSuccess: (res) =>
      setMsg(res.restored ? 'Restore complete — the app is restarting…' : null),
    onError: (e) => setError(e.message),
  });

  const changePw = useMutation({
    mutationFn: (p: { current: string; next: string }) =>
      call('auth:changePassword', { currentPassword: p.current, newPassword: p.next }),
    onSuccess: () => setMsg('Password changed ✓'),
    onError: (e) => setError(e.message),
  });

  if (!form) return <div className="text-slate-400">Loading…</div>;
  const set = (patch: Partial<Settings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      {error && <ErrorNote error={error} />}

      <form
        className="space-y-4 rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setError(null);
          save.mutate(form);
        }}
      >
        <h2 className="font-semibold">Library</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Library name">
            <input className={inputCls} value={form.library_name} onChange={(e) => set({ library_name: e.target.value })} />
          </Field>
          <Field label="Currency symbol">
            <input className={inputCls} value={form.currency_symbol} onChange={(e) => set({ currency_symbol: e.target.value })} />
          </Field>
        </div>

        <h2 className="pt-2 font-semibold">Circulation rules</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loan period (days)">
            <input className={inputCls} type="number" min={1} value={form.loan_period_days} onChange={(e) => set({ loan_period_days: Number(e.target.value) })} />
          </Field>
          <Field label="Max books per member">
            <input className={inputCls} type="number" min={1} value={form.max_books_per_member} onChange={(e) => set({ max_books_per_member: Number(e.target.value) })} />
          </Field>
          <Field label="Fine per day (in smallest unit, e.g. paise)">
            <input className={inputCls} type="number" min={0} value={form.fine_per_day_paise} onChange={(e) => set({ fine_per_day_paise: Number(e.target.value) })} />
          </Field>
          <Field label="Max renewals">
            <input className={inputCls} type="number" min={0} value={form.max_renewals} onChange={(e) => set({ max_renewals: Number(e.target.value) })} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          Fine per day {form.fine_per_day_paise} = {form.currency_symbol}
          {(form.fine_per_day_paise / 100).toFixed(2)} per day late.
          {form.fine_per_day_paise === 0 && ' Overdue returns will not be fined.'}{' '}
          {form.max_renewals === 0
            ? 'Max renewals 0 — loans cannot be renewed at all.'
            : `Each loan can be renewed up to ${form.max_renewals} time${form.max_renewals === 1 ? '' : 's'}.`}
        </p>

        <h2 className="pt-2 font-semibold">Accession numbering</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prefix">
            <input className={inputCls} value={form.accession_prefix} onChange={(e) => set({ accession_prefix: e.target.value })} />
          </Field>
          <Field label="Next sequence number">
            <input className={inputCls} type="number" min={1} value={form.accession_next_seq} onChange={(e) => set({ accession_next_seq: Number(e.target.value) })} />
          </Field>
        </div>
        <p className="text-xs text-slate-400">
          Next accession number will be {form.accession_prefix}-{String(form.accession_next_seq).padStart(4, '0')}
        </p>

        <button className={btnPrimary} disabled={save.isPending}>
          Save settings
        </button>
      </form>

      <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-semibold">Backup &amp; restore</h2>
        <p className="mb-3 text-sm text-slate-500">
          With a backup folder set, the database and covers are copied there automatically every
          day and each time the app closes (the last 30 backups are kept). Pick a folder inside
          OneDrive or Google Drive to get off-machine copies for free.
        </p>
        <div className="mb-3 flex items-center gap-2">
          <input className={inputCls} value={form.backup_dir || ''} placeholder="No automatic backup folder set" readOnly />
          <button className={`${btnSecondary} shrink-0`} onClick={() => setBackupDir.mutate(null)} disabled={setBackupDir.isPending}>
            <FolderOpen size={15} weight="fill" /> Choose…
          </button>
          {form.backup_dir && (
            <button className={`${btnSecondary} shrink-0`} onClick={() => setBackupDir.mutate('')} disabled={setBackupDir.isPending}>
              Disable
            </button>
          )}
        </div>
        {form.backup_auto_last && (
          <p className="mb-3 text-xs text-slate-400">Last automatic backup: {form.backup_auto_last}</p>
        )}
        <div className="flex items-center gap-2">
          <button className={btnSecondary} onClick={() => backup.mutate()} disabled={backup.isPending}>
            <FloppyDisk size={15} weight="fill" />
            {backup.isPending ? 'Backing up…' : 'Backup now'}
          </button>
          <button
            className={btnDanger}
            disabled={restore.isPending}
            onClick={() => {
              if (
                confirm(
                  'Restore replaces ALL current data (books, members, loans, fines) with the ' +
                    'selected backup, then restarts the app. A safety copy of the current ' +
                    'database is kept. Continue?',
                )
              )
                restore.mutate();
            }}
          >
            <ArrowCounterClockwise size={15} weight="bold" /> Restore from backup…
          </button>
        </div>
      </div>

      <StaffCard onError={setError} onMsg={setMsg} />

      <ChangePasswordCard onSubmit={(current, next) => changePw.mutate({ current, next })} />
    </div>
  );
}

function ChangePasswordCard({ onSubmit }: { onSubmit: (current: string, next: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  return (
    <form
      className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(current, next);
        setCurrent('');
        setNext('');
      }}
    >
      <h2 className="mb-3 font-semibold">Change my password</h2>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Current password">
          <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password">
          <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
      </div>
      <button className={`${btnSecondary} mt-3`}>Change password</button>
    </form>
  );
}

function StaffCard({ onError, onMsg }: { onError: (m: string) => void; onMsg: (m: string) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: () => call('staff:list') });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<StaffUser | null>(null);

  const done = (msg: string) => {
    onMsg(msg);
    qc.invalidateQueries({ queryKey: ['staff'] });
  };

  const setActive = useMutation({
    mutationFn: (p: { userId: number; active: boolean }) => call('staff:setActive', p),
    onSuccess: (_d, p) => done(p.active ? 'Account activated ✓' : 'Account deactivated ✓'),
    onError: (e) => onError(e.message),
  });

  return (
    <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Staff accounts</h2>
        <button className={btnSecondary} onClick={() => setAdding(true)}>
          <UserPlus size={15} weight="fill" /> Add staff
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Librarian logins for this app. New and reset accounts must change their password at first
        sign-in. You cannot deactivate yourself or the last active account.
      </p>
      <ul className="divide-y divide-slate-100 rounded border border-slate-200">
        {(staff ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <b>{s.username}</b>
              {s.id === user?.id && <span className="text-xs text-slate-400">(you)</span>}
              <Badge value={s.is_active ? 'active' : 'suspended'} />
            </span>
            <span className="flex items-center gap-3">
              <button className="text-xs text-indigo-600 hover:underline" onClick={() => setResetting(s)}>
                <Key size={12} weight="fill" className="mr-1 inline" />
                Reset password
              </button>
              {s.id !== user?.id && (
                <button
                  className="text-xs text-slate-500 hover:text-red-600 hover:underline"
                  onClick={() => {
                    const next = s.is_active !== 1;
                    if (next || confirm(`Deactivate "${s.username}"? They will no longer be able to sign in.`)) {
                      setActive.mutate({ userId: s.id, active: next });
                    }
                  }}
                >
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {adding && (
        <StaffFormModal
          title="Add staff account"
          usernameEditable
          onClose={() => setAdding(false)}
          onSubmit={async (username, password) => {
            await call('staff:create', { username, password });
            setAdding(false);
            done(`Staff account "${username}" created ✓`);
          }}
        />
      )}
      {resetting && (
        <StaffFormModal
          title={`Reset password — ${resetting.username}`}
          onClose={() => setResetting(null)}
          onSubmit={async (_username, password) => {
            await call('staff:setPassword', { userId: resetting.id, newPassword: password });
            setResetting(null);
            done(`Password reset for "${resetting.username}" ✓`);
          }}
        />
      )}
    </div>
  );
}

function StaffFormModal({
  title,
  usernameEditable,
  onClose,
  onSubmit,
}: {
  title: string;
  usernameEditable?: boolean;
  onClose: () => void;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSubmit(username, password);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {usernameEditable && (
          <Field label="Username">
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
          </Field>
        )}
        <Field label="Temporary password">
          <input
            className={inputCls}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!usernameEditable}
            required
          />
        </Field>
        <p className="text-xs text-slate-400">They will be asked to set their own password at first sign-in.</p>
        {error && <ErrorNote error={error} />}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={busy}>
            Save
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
