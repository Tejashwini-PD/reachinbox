import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Inbox,
  LogOut,
  Mail,
  Menu,
  PenLine,
  Send,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEmailCounts } from '../hooks/useEmailCounts';
import { API_ORIGIN } from '../services/api';
import { emailInitials, initials } from '../utils/format';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Emails', subtitle: 'Track scheduled and delivered campaigns.' },
  '/compose': { title: 'Compose', subtitle: 'Schedule a new email batch.' },
  '/settings': { title: 'Settings', subtitle: 'Senders, Slack and search recovery.' },
};

function tabFromSearch(search: string): 'scheduled' | 'sent' {
  return new URLSearchParams(search).get('tab') === 'sent' ? 'sent' : 'scheduled';
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { counts } = useEmailCounts();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeTab = tabFromSearch(location.search);
  const page = pageTitles[location.pathname] ?? { title: 'ReachInbox', subtitle: '' };

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const navItems = [
    {
      label: 'Scheduled',
      to: '/dashboard?tab=scheduled',
      icon: Inbox,
      count: counts.scheduled,
      active: location.pathname === '/dashboard' && activeTab === 'scheduled',
    },
    {
      label: 'Sent',
      to: '/dashboard?tab=sent',
      icon: Send,
      count: counts.sent,
      active: location.pathname === '/dashboard' && activeTab === 'sent',
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-black/[0.06] bg-white transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Link to="/dashboard" className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Mail className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[15px] font-bold leading-tight tracking-tight text-ink">
                ReachInbox
              </span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Outbox scheduler
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="icon-btn lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-5">
          <Link
            to="/compose"
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-brand-600/30 bg-brand-50/60 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:border-brand-600/50 hover:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <PenLine className="h-4 w-4" />
            Compose
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Core
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  item.active
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-600 hover:bg-black/[0.035] hover:text-slate-900'
                }`}
              >
                {item.active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />
                )}
                <item.icon className={`h-4 w-4 ${item.active ? 'text-brand-600' : 'text-slate-400'}`} />
                <span className="flex-1">{item.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    item.active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.count}
                </span>
              </Link>
            ))}
          </nav>

          <p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Workspace
          </p>
          <nav className="space-y-1">
            <NavLink
              to="/settings"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-600 hover:bg-black/[0.035] hover:text-slate-900'
                }`
              }
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Settings
            </NavLink>
            <a
              href={`${API_ORIGIN}/admin/queues`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-black/[0.035] hover:text-slate-900"
            >
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              Queue dashboard
            </a>
          </nav>
        </div>

        <div className="border-t border-black/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? user.email}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {initials(user?.name ?? user?.email)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{user?.name ?? 'User'}</p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-canvas/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="icon-btn lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight text-ink">{page.title}</h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{page.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2.5 rounded-full border border-black/[0.06] bg-white py-1.5 pl-1.5 pr-3 sm:flex">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name ?? user.email}
                    className="h-7 w-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
                    {initials(user?.name ?? user?.email)}
                  </div>
                )}
                <div className="leading-tight">
                  <p className="max-w-[140px] truncate text-xs font-semibold text-slate-900">
                    {user?.name ?? 'User'}
                  </p>
                  <p className="max-w-[140px] truncate text-[10px] text-slate-500">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary hidden sm:inline-flex"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
              <button
                type="button"
                className="icon-btn sm:hidden"
                onClick={handleLogout}
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 sm:hidden">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name ?? user.email}
                    className="h-9 w-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  emailInitials(user?.email ?? '?')
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
