import { Outlet, Link } from 'react-router-dom';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';

// Desktop shell (1366px target, FINAL_PROJECT_STRUCTURE.md §3) for /staff/* and /admin/*.
export function OpsLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <Link to="/" className="text-sm font-semibold text-slate-900">
          MediQueue
        </Link>
        <ConnectionPill state="connecting" />
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
