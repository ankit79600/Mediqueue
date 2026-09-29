import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Activity, LogOut } from 'lucide-react';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { getUser, logout } from '@/lib/auth.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';

const socket = import.meta.env.VITE_USE_MOCKS === 'true' ? mockSocket : realSocket;

export function OpsLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const [connection, setConnection] = useState(socket.getConnectionState());

  useEffect(() => socket.onConnectionChange(setConnection), []);

  function handleLogout() {
    logout();
    navigate('/staff/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="sticky top-0 z-30 border-b border-[#e2e8f0] bg-white/90 px-6 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <Link to="/staff/login" className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#0284c7] text-white">
              <Activity className="size-4" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-[#0f172a]">MediQueue</p>
              <p className="text-[10px] text-[#5b6b82]">OPD Management</p>
            </div>
          </Link>

          {user && (
            <div className="flex items-center gap-3 text-sm text-[#5b6b82]">
              <span className="hidden sm:inline">{user.name}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <ConnectionPill state={connection} />
            {user && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg border border-[#e2e8f0] bg-white px-3 py-1.5 text-sm font-medium text-[#5b6b82] hover:border-[#0284c7]/30 hover:text-[#0284c7] transition-colors"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                Log out
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
