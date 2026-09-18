import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowsLeftRight,
  BookBookmark,
  Books,
  ChartBar,
  Coins,
  GearSix,
  MagnifyingGlass,
  SignOut,
  SquaresFour,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react';
import { LogoMark } from './Logo';
import { call } from '../api/client';
import { useAuth } from '../AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: typeof SquaresFour;
  chip: string;
}
interface NavSection {
  title: string | null;
  items: NavItem[];
}

const librarianNav: NavSection[] = [
  {
    title: 'Library',
    items: [
      { to: '/', label: 'Dashboard', icon: SquaresFour, chip: 'bg-sky-400/20 text-sky-300' },
      { to: '/catalog', label: 'Catalog', icon: Books, chip: 'bg-orange-400/20 text-orange-300' },
      { to: '/members', label: 'Members', icon: UsersThree, chip: 'bg-emerald-400/20 text-emerald-300' },
    ],
  },
  {
    title: 'Circulation',
    items: [
      { to: '/circulation', label: 'Issue / Return', icon: ArrowsLeftRight, chip: 'bg-purple-400/20 text-purple-300' },
      { to: '/loans', label: 'Loans', icon: BookBookmark, chip: 'bg-yellow-400/20 text-yellow-300' },
      { to: '/fines', label: 'Fines', icon: Coins, chip: 'bg-rose-400/20 text-rose-300' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/reports', label: 'Reports', icon: ChartBar, chip: 'bg-cyan-400/20 text-cyan-300' },
      { to: '/settings', label: 'Settings', icon: GearSix, chip: 'bg-slate-400/20 text-slate-300' },
    ],
  },
];

const memberNav: NavSection[] = [
  {
    title: null,
    items: [
      { to: '/opac', label: 'Search Catalog', icon: MagnifyingGlass, chip: 'bg-sky-400/20 text-sky-300' },
      { to: '/my-account', label: 'My Account', icon: UserCircle, chip: 'bg-emerald-400/20 text-emerald-300' },
    ],
  },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => call('settings:get') });
  const nav = user?.role === 'librarian' ? librarianNav : memberNav;

  return (
    <div className="flex h-screen">
      <aside className="no-print flex w-60 shrink-0 flex-col border-r border-white/5 bg-gradient-to-b from-[#182c4f] via-[#16294a] to-[#101f3b] text-[#dde5f0]">
        <div className="flex items-center gap-3 px-4 py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-lg shadow-black/30">
            <LogoMark size={34} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-extrabold tracking-tight">
              <span className="text-white">Libra</span>
              <span className="text-[#6db1f5]">Flow</span>
            </div>
            <div className="truncate text-[11px] font-medium tracking-wider text-indigo-300/80 uppercase">
              {settings?.library_name ?? 'Library Management'}
            </div>
          </div>
        </div>
        <nav className="mt-1 flex-1 overflow-y-auto px-3">
          {nav.map((section, si) => (
            <div key={si} className={si > 0 ? 'mt-4' : ''}>
              {section.title && (
                <div className="px-2.5 pb-1.5 text-[10px] font-bold tracking-[0.14em] text-[#5f7396] uppercase">
                  {section.title}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-bold transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-500 to-indigo-400 text-white shadow-lg shadow-black/30'
                          : 'text-[#8da2c0] hover:bg-white/5 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            isActive ? 'bg-white/20 text-white' : item.chip
                          }`}
                        >
                          <item.icon size={16} weight="fill" />
                        </span>
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3">
          <div className="rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
            <div className="mb-2 flex items-center gap-2.5 px-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white uppercase">
                {user?.username?.slice(0, 2)}
              </div>
              <div className="min-w-0 text-xs">
                <div className="truncate font-semibold text-white">{user?.username}</div>
                <div className="text-[#8da2c0] capitalize">{user?.role}</div>
              </div>
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="flex w-full items-center gap-2 rounded bg-white/5 px-3 py-1.5 text-left text-xs font-semibold text-[#dde5f0] transition hover:bg-white/10 hover:text-white"
            >
              <SignOut size={13} weight="bold" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="print-area flex-1 overflow-y-auto p-6">
        <div className="animate-rise mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
