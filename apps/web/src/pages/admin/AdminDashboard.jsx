import { useAdminStats } from '@/hooks/useAdminStats.js';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ApiError } from '@/lib/api.js';

// MVP_CHECKLIST.md M5. This is the dashboard shell (subphase 3A): auth guard
// (RequireRole in App.jsx), connection state, loading/error handling, and the
// confirmed admin snapshot. KPI cards, department table, and charts are
// subphase 3B/3C.
function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'FORBIDDEN') return "You don't have admin access.";
    if (err.code === 'UNAUTHENTICATED') return 'Your session expired. Please sign in again.';
    return err.message;
  }
  if (err?.code) return err.message ?? 'Could not load the dashboard.'; // SocketAckError
  return 'Could not load the dashboard. Check your connection and try again.';
}

export default function AdminDashboard() {
  const { stats, status, error, connection, refetch } = useAdminStats();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Admin dashboard</h1>
        <ConnectionPill state={connection} />
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {status === 'error' && (
        <Card>
          <CardHeader>
            <CardTitle>Couldn't load the dashboard</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-red-600">{errorMessage(error)}</p>
            <Button className="w-fit" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'ready' && (
        <Card>
          <CardHeader>
            <CardTitle>Dashboard connected</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500">
              Service date {stats.serviceDate} · {stats.totals.activeDoctors} active doctors across{' '}
              {stats.departments.length} departments.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              KPI cards, department statistics, and charts arrive in the next phase.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
