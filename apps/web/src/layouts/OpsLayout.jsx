import { useEffect, useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { Button } from '@/components/ui/button.jsx';
import { getUser, logout } from '@/lib/auth.js';
import * as realSocket from '@/lib/socket.js';
import * as mockSocket from '@/mocks/mockSocket.js';

const socket = import.meta.env.VITE_USE_MOCKS === 'true' ? mockSocket : realSocket;

// Desktop shell (1366px target, FINAL_PROJECT_STRUCTURE.md §3) for /staff/* and /admin/*.
export function OpsLayout() {
  const navigate = useNavigate();
  const user = getUser();
  // Reuses the same single-socket-per-tab connection state every page hook
  // already reads (lib/socket.js §"One socket per tab") — no separate
  // connection tracking here, just the shared getConnectionState()/
  // onConnectionChange() primitive. This is the raw live/offline state;
  // the "polling" refinement is page-specific (depends on which REST
  // endpoint that page would fall back to) and stays in the page hooks.
  const [connection, setConnection] = useState(socket.getConnectionState());

  useEffect(() => socket.onConnectionChange(setConnection), []);

  function handleLogout() {
    logout();
    navigate('/staff/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className="text-sm font-semibold text-slate-900">
          MediQueue
        </Link>
        <div className="flex items-center gap-3">
          <ConnectionPill state={connection} />
          {user && (
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          )}
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
