import { useAdminStats } from '@/hooks/useAdminStats.js';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { StatCard } from '@/components/StatCard.jsx';
import { DepartmentTable } from '@/components/admin/DepartmentTable.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ApiError } from '@/lib/api.js';

// MVP_CHECKLIST.md M5. Shell (3A) + KPI row / department statistics (3B).
// Charts and overload highlighting are 3C; live stats:update is 3D.
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
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
        <>
          {/* MVP_CHECKLIST.md M5: "Top KPI cards: total waiting, in consultation,
              completed today, average wait time." Exactly these four — no more. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Total waiting" value={stats.totals.waiting} />
            <StatCard label="In consultation" value={stats.totals.inConsultation} />
            <StatCard label="Completed today" value={stats.totals.completedToday} />
            <StatCard label="Avg wait" value={`${stats.totals.avgWaitMin} min`} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Department statistics</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DepartmentTable departments={stats.departments} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
