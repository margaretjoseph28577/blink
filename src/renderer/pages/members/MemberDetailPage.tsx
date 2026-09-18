import { classLabel } from '../../../shared/types';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Key, PencilSimple, Trash } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { call, formatDate, formatMoney } from '../../api/client';
import CoverThumb from '../../components/CoverThumb';
import MemberAvatar from '../../components/MemberAvatar';
import {
  Badge, EmptyState, ErrorNote, Field, Modal, Table,
  btnDanger, btnPrimary, btnSecondary, inputCls, tdCls, thCls,
} from '../../components/ui';
import { MemberFormModal } from './MembersPage';

type Tab = 'loans' | 'fines' | 'history';

export default function MemberDetailPage() {
  const { id } = useParams();
  const memberId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [loginModal, setLoginModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('loans');

  const { data, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => call('members:get', { id: memberId }),
  });

  const del = useMutation({
    mutationFn: () => call('members:delete', { id: memberId }),
    onSuccess: () => {
      qc.invalidateQueries();
      navigate('/members');
    },
    onError: (e) => {
      setError(e.message);
      qc.invalidateQueries({ queryKey: ['member', id] });
    },
  });

  if (isLoading || !data) return <div className="text-slate-400">Loading…</div>;
  const { member, hasLogin, loginUsername, activeLoans, loanHistory, fines } = data;
  const outstandingCount = fines.filter((f) => f.status === 'outstanding').length;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'loans', label: `Books out (${activeLoans.length})` },
    { key: 'fines', label: `Fines (${outstandingCount} due)` },
    { key: 'history', label: `History (${loanHistory.length})` },
  ];

  return (
    <div className="space-y-4">
      {error && <ErrorNote error={error} />}
      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-72">
          <div className="rounded-lg border border-slate-200/70 bg-white p-5 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-3 w-fit">
                <MemberAvatar memberId={memberId} name={member.name} size={96} />
              </div>
              <h1 className="text-xl font-bold">{member.name}</h1>
              <div className="font-mono text-sm text-slate-400">{member.member_code}</div>
              <div className="mt-2 flex justify-center gap-1.5">
                <Badge value={member.member_type} />
                <Badge value={member.status} />
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              {member.member_type === 'student' && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Class</dt>
                    <dd className="font-semibold">{classLabel(member) ?? <span className="font-normal text-slate-400">—</span>}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Roll no</dt>
                    <dd>{member.roll_no ?? <span className="text-slate-400">—</span>}</dd>
                  </div>
                  {(member.guardian_name || member.guardian_phone) && (
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-slate-400">Guardian</dt>
                      <dd className="truncate text-right">
                        {member.guardian_name}
                        {member.guardian_name && member.guardian_phone && ' · '}
                        {member.guardian_phone}
                      </dd>
                    </div>
                  )}
                </>
              )}
              {member.email && (
                <div className="flex justify-between gap-2">
                  <dt className="shrink-0 text-slate-400">Email</dt>
                  <dd className="truncate">{member.email}</dd>
                </div>
              )}
              {member.phone && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Phone</dt>
                  <dd>{member.phone}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">Joined</dt>
                <dd>{formatDate(member.join_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">OPAC login</dt>
                <dd>{hasLogin ? <b>{loginUsername}</b> : <span className="text-slate-400">none</span>}</dd>
              </div>
            </dl>
            {member.notes && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-500">{member.notes}</p>
            )}
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <button className={`${btnSecondary} w-full justify-center`} onClick={() => setLoginModal(true)}>
                <Key size={15} weight="fill" /> {hasLogin ? 'Reset login' : 'Create login'}
              </button>
              <button className={`${btnSecondary} w-full justify-center`} onClick={() => setEditing(true)}>
                <PencilSimple size={15} weight="fill" /> Edit profile
              </button>
              <button
                className={`${btnDanger} w-full justify-center`}
                onClick={() => {
                  if (confirm(`Delete member ${member.name}?`)) del.mutate();
                }}
              >
                <Trash size={15} weight="fill" /> Delete
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3.5 py-2 text-sm font-semibold transition ${
                  tab === t.key
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                    : 'text-slate-600 hover:bg-indigo-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'loans' &&
            (activeLoans.length === 0 ? (
              <EmptyState message="No books out" />
            ) : (
              <LoanTable loans={activeLoans} />
            ))}

          {tab === 'fines' &&
            (fines.length === 0 ? (
              <EmptyState message="No fines" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th className={thCls}>Book</th>
                    <th className={thCls}>Reason</th>
                    <th className={`${thCls} text-right`}>Amount</th>
                    <th className={`${thCls} text-right`}>Paid</th>
                    <th className={`${thCls} text-right`}>Balance</th>
                    <th className={thCls}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fines.map((f) => (
                    <tr key={f.id}>
                      <td className={tdCls}>
                        {f.book_id ? (
                          <div className="flex items-center gap-2.5">
                            <CoverThumb bookId={f.book_id} />
                            <Link to={`/catalog/${f.book_id}`} className="text-indigo-600 hover:underline">
                              {f.title}
                            </Link>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={tdCls}>{f.reason}</td>
                      <td className={`${tdCls} text-right`}>{formatMoney(f.amount_paise)}</td>
                      <td className={`${tdCls} text-right`}>{formatMoney(f.amount_paid_paise)}</td>
                      <td className={`${tdCls} text-right font-semibold ${f.status === 'outstanding' ? 'text-red-600' : ''}`}>
                        {f.status === 'outstanding' ? formatMoney(f.amount_paise - f.amount_paid_paise) : '—'}
                      </td>
                      <td className={tdCls}>
                        <Badge value={f.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ))}

          {tab === 'history' &&
            (loanHistory.length === 0 ? (
              <EmptyState message="No past loans" />
            ) : (
              <LoanTable loans={loanHistory} />
            ))}
        </div>
      </div>

      {editing && (
        <MemberFormModal
          title="Edit member"
          initial={{
            name: member.name,
            email: member.email,
            phone: member.phone,
            join_date: member.join_date,
            status: member.status,
            notes: member.notes,
          }}
          onClose={() => setEditing(false)}
          onSave={async (m) => {
            await call('members:update', { id: memberId, member: m });
            qc.invalidateQueries();
            setEditing(false);
          }}
        />
      )}
      {loginModal && (
        <CreateLoginModal
          memberId={memberId}
          defaultUsername={loginUsername ?? member.member_code.toLowerCase()}
          onClose={() => setLoginModal(false)}
          onDone={() => {
            setLoginModal(false);
            qc.invalidateQueries({ queryKey: ['member', id] });
          }}
        />
      )}
    </div>
  );
}

function LoanTable({ loans }: { loans: import('../../../shared/types').LoanDetail[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th className={thCls}>Accession No</th>
          <th className={thCls}>Title</th>
          <th className={thCls}>Out</th>
          <th className={thCls}>Due</th>
          <th className={thCls}>Returned</th>
          <th className={thCls}>Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {loans.map((l) => (
          <tr key={l.id}>
            <td className={`${tdCls} font-mono`}>{l.accession_number}</td>
            <td className={tdCls}>
              <div className="flex items-center gap-2.5">
                <CoverThumb bookId={l.book_id} />
                <Link to={`/catalog/${l.book_id}`} className="text-indigo-600 hover:underline">
                  {l.title}
                </Link>
              </div>
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
  );
}

function CreateLoginModal({
  memberId,
  defaultUsername,
  onClose,
  onDone,
}: {
  memberId: number;
  defaultUsername: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => call('auth:createMemberLogin', { memberId, username, password }),
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });

  return (
    <Modal title="Member login (OPAC)" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Username">
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} required />
        </Field>
        <Field label="Password">
          <input className={inputCls} type="text" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <ErrorNote error={error} />}
        <div className="flex gap-2">
          <button className={btnPrimary} disabled={save.isPending}>
            Save login
          </button>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
