import { useQuery } from '@tanstack/react-query';
import { call, formatDate, formatMoney } from '../../api/client';
import CoverThumb from '../../components/CoverThumb';
import { useAuth } from '../../AuthContext';
import { Badge, EmptyState, Table, tdCls, thCls } from '../../components/ui';

export default function MyAccountPage() {
  const { user } = useAuth();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  // Server scopes these to the logged-in member automatically.
  const { data: loans } = useQuery({
    queryKey: ['my-loans'],
    queryFn: () => call('loans:list', { filter: 'all' }),
  });
  const { data: fines } = useQuery({
    queryKey: ['my-fines'],
    queryFn: () => call('fines:list', {}),
  });

  const sym = settings?.currency_symbol ?? '₹';
  const active = loans?.filter((l) => l.status === 'active') ?? [];
  const past = loans?.filter((l) => l.status === 'returned') ?? [];
  const outstanding = fines?.filter((f) => f.status === 'outstanding') ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">My Account</h1>
      <p className="text-slate-500">Signed in as {user?.username}</p>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Books I have out ({active.length})</h2>
        {active.length === 0 ? (
          <EmptyState message="You have no books out" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Title</th>
                <th className={thCls}>Borrowed</th>
                <th className={thCls}>Due</th>
                <th className={thCls}>Renewals used</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((l) => (
                <tr key={l.id}>
                  <td className={`${tdCls} font-medium`}>
                    <div className="flex items-center gap-2.5">
                      <CoverThumb bookId={l.book_id} />
                      {l.title}
                    </div>
                  </td>
                  <td className={tdCls}>{formatDate(l.checkout_date)}</td>
                  <td className={`${tdCls} ${l.days_overdue > 0 ? 'font-semibold text-red-600' : ''}`}>
                    {formatDate(l.due_date)}
                  </td>
                  <td className={tdCls}>
                    {l.renewals_count}
                    {settings !== undefined && ` of ${settings.max_renewals}`}
                  </td>
                  <td className={tdCls}>
                    {l.days_overdue > 0 ? (
                      <span className="font-medium text-red-600">{l.days_overdue} day(s) overdue</span>
                    ) : (
                      <Badge value="active" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Fines due</h2>
        {outstanding.length === 0 ? (
          <EmptyState message="No fines due" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Book</th>
                <th className={thCls}>Reason</th>
                <th className={thCls}>Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {outstanding.map((f) => (
                <tr key={f.id}>
                  <td className={tdCls}>
                    {f.book_id ? (
                      <div className="flex items-center gap-2.5">
                        <CoverThumb bookId={f.book_id} />
                        {f.title}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={tdCls}>{f.reason}</td>
                  <td className={`${tdCls} font-semibold text-red-600`}>
                    {formatMoney(f.amount_paise - f.amount_paid_paise, sym)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Borrowing history</h2>
        {past.length === 0 ? (
          <EmptyState message="No past loans" />
        ) : (
          <Table>
            <thead>
              <tr>
                <th className={thCls}>Title</th>
                <th className={thCls}>Borrowed</th>
                <th className={thCls}>Returned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {past.map((l) => (
                <tr key={l.id}>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2.5">
                      <CoverThumb bookId={l.book_id} />
                      {l.title}
                    </div>
                  </td>
                  <td className={tdCls}>{formatDate(l.checkout_date)}</td>
                  <td className={tdCls}>{formatDate(l.return_date)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
