import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Activity, Bell, LogOut, UserRound } from 'lucide-react';
import { getToken, clearToken } from '@/lib/auth.js';
import SoftAurora from '@/components/SoftAurora.jsx';

export function PatientLayout() {
  const navigate = useNavigate();
  const isLoggedIn = !!getToken();

  function handleLogout() {
    clearToken();
    navigate('/patient/login', { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb]">
      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SoftAurora speed={0.2} brightness={0.55} color1="#dbeafe" color2="#60a5fa" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0284c7] px-4 py-3 text-white shadow-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <Link to={isLoggedIn ? '/patient/tokens' : '/patient/login'} className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-white/20">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">MediQueue</p>
              <p className="text-xs text-white/70">OPD Queue System</p>
            </div>
          </Link>

          {isLoggedIn && (
            <div className="flex items-center gap-1.5">
              <Link
                to="/patient/tokens"
                className="flex size-9 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25"
                aria-label="My tokens"
              >
                <Bell className="size-5" aria-hidden="true" />
              </Link>
              <div className="flex size-9 items-center justify-center rounded-xl bg-white text-[#0284c7]">
                <UserRound className="size-5" aria-hidden="true" />
              </div>
              <button
                onClick={handleLogout}
                className="flex size-9 items-center justify-center rounded-xl bg-white/15 transition-colors hover:bg-white/25"
                aria-label="Sign out"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 mx-auto w-full max-w-md px-4 pb-12 pt-5">
        <Outlet />
      </main>
    </div>
  );
}
