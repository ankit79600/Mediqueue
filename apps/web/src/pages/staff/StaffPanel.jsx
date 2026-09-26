import { useParams } from 'react-router-dom';
import { useDoctorQueue } from '@/hooks/useDoctorQueue.js';
import { TokenCard } from '@/components/TokenCard.jsx';
import { QueueTable } from '@/components/QueueTable.jsx';
import { StatCard } from '@/components/StatCard.jsx';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.jsx';
import { Skeleton } from '@/components/ui/skeleton.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ApiError } from '@/lib/api.js';

function errorMessage(err) {
  if (err instanceof ApiError) {
    if (err.code === 'FORBIDDEN') return "You don't have access to this doctor's queue.";
    if (err.code === 'DOCTOR_NOT_FOUND') return 'This doctor could not be found.';
    if (err.code === 'UNAUTHENTICATED') return 'Your session expired. Please sign in again.';
    return err.message;
  }
  if (err?.code) return err.message ?? 'Could not load the queue.'; // SocketAckError
  return 'Could not load the queue. Check your connection and try again.';
}

export default function StaffPanel() {
  const { doctorId } = useParams();
  // Remount per doctorId instead of resetting hook state internally.
  return <DoctorQueuePanel key={doctorId} doctorId={doctorId} />;
}

function DoctorQueuePanel({ doctorId }) {
  const { snapshot, status, error, connection, refetch } = useDoctorQueue(doctorId);

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Couldn't load the queue</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-red-600">{errorMessage(error)}</p>
          <Button className="w-fit" onClick={refetch}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { doctor, department, current, waiting, stats } = snapshot;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{doctor.name}</h1>
          <p className="text-sm text-slate-500">
            {department.name} · {doctor.room}
          </p>
        </div>
        <ConnectionPill state={connection} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TokenCard token={current} />
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
          <StatCard label="Served today" value={stats.servedToday} />
          <StatCard label="No-shows" value={stats.noShowToday} />
          <StatCard label="Waiting" value={stats.waitingCount} />
          <StatCard label="Avg consult" value={`${stats.avgConsultMin} min`} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waiting queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <QueueTable tokens={waiting} />
        </CardContent>
      </Card>
    </div>
  );
}
