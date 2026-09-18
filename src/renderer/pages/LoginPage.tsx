import { useState } from 'react';
import { LogoMark, LogoWordmark } from '../components/Logo';
import { useQuery } from '@tanstack/react-query';
import { call } from '../api/client';
import { useAuth } from '../AuthContext';
import { Field, Modal, btnPrimary, inputCls, ErrorNote } from '../components/ui';

export default function LoginPage() {
  const { login, refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustChange, setMustChange] = useState(false);
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(username, password);
      if (user.mustChangePassword) setMustChange(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[#0e1f38]">
      <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-500/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -bottom-32 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-indigo-400/15 blur-3xl" />
      <div className="animate-rise relative w-full max-w-sm rounded-xl bg-white/95 p-8 shadow-2xl ring-1 ring-white/20 backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center">
            <LogoMark size={76} />
          </div>
          <h1 className="mt-2 text-2xl">
            <LogoWordmark />
          </h1>
          <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase">
            Library Management Software
          </p>
          {settings?.library_name && (
            <p className="mt-3 text-sm font-medium text-slate-600">{settings.library_name}</p>
          )}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Username">
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {error && <ErrorNote error={error} />}
          <button className={`${btnPrimary} w-full justify-center`} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          First run? Sign in with <b>admin / admin</b>
        </p>
      </div>
      {mustChange && <ForcePasswordChange onDone={() => { setMustChange(false); refresh(); }} />}
    </div>
  );
}

function ForcePasswordChange({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    try {
      await call('auth:changePassword', { currentPassword: current, newPassword: next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal title="Set a new password">
      <p className="mb-4 text-sm text-slate-500">
        For security you must change the default password before continuing.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Current password">
          <input className={inputCls} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password">
          <input className={inputCls} type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirm new password">
          <input className={inputCls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && <ErrorNote error={error} />}
        <button className={`${btnPrimary} w-full justify-center`}>Save password</button>
      </form>
    </Modal>
  );
}
