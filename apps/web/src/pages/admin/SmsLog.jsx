import { Link } from 'react-router-dom';
import { useAdminNotifications } from '@/hooks/useAdminNotifications.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import { ApiError } from '@/lib/api.js';

// MVP_CHECKLIST.md M6: "Simulated SMS written to notifications... visible
// live on /admin/sms." API_CONTRACT.md §2.10 Notification shape, E22 for
// history, notification:new for live rows (handled in useAdminNotifications).
function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'FORBIDDEN') return "You don't have admin access.";
    if (err.code === 'UNAUTHENTICATED') return 'Your session expired. Please sign in again.';
    return err.message;
  }
  return 'Could not load the notification log. Check your connection and try again.';
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const KIND_VARIANT = {
  THREE_AWAY: 'warning',
  CALLED: 'info',
  TOKEN_CREATED: 'default',
  SKIPPED: 'warning',
  NO_SHOW: 'danger',
};

export default function SmsLog() {
  const { items, status, error, hasMore, loadingMore, loadMore, refetch } = useAdminNotifications();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-slate-900">Simulated SMS log</h1>
        <Link to="/admin" className="text-sm text-slate-500 underline-offset-2 hover:underline">
          Back to dashboard
        </Link>
      </div>

      {status === 'loading' && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {status === 'error' && (
        <Card>
          <CardHeader>
            <CardTitle>Couldn't load the notification log</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-red-600">{errorMessage(error)}</p>
            <Button className="w-fit" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'ready' && items.length === 0 && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-slate-500">No notifications yet.</p>
          </CardContent>
        </Card>
      )}

      {status === 'ready' && items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-0">
            <div className="divide-y divide-slate-100">
              {items.map((n) => (
                <div key={n.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={KIND_VARIANT[n.kind] ?? 'default'}>{n.kind}</Badge>
                      <span className="text-xs text-slate-400">{n.channel}</span>
                      <span className="text-xs font-medium text-slate-600">{n.tokenNo}</span>
                    </div>
                    <p className="text-sm text-slate-700">{n.message}</p>
                    <p className="text-xs text-slate-400">To {n.toPhoneMasked}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{formatTime(n.createdAt)}</span>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="p-4 pt-0">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
