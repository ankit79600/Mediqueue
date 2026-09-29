import { Card, CardContent } from '@/components/ui/card.jsx';

export function StatCard({ label, value }) {
  return (
    <Card className="border-l-4 border-l-[#0284c7]">
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[#5b6b82]">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-[#0f172a]">{value}</p>
      </CardContent>
    </Card>
  );
}
