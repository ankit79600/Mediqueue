import { Card, CardContent } from '@/components/ui/card.jsx';

export function StatCard({ label, value }) {
  return (
    <Card className="border-l-4 border-l-indigo-500">
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
