import { Link } from 'react-router-dom';
import { ConnectionPill } from '@/components/ConnectionPill.jsx';
import { Card, CardContent, CardTitle } from '@/components/ui/card.jsx';

// FINAL_PROJECT_STRUCTURE.md §3 route "/" — choose Patient / Staff / Admin / Kiosk / Display.
const LINKS = [
  { to: '/patient/login', label: 'Patient' },
  { to: '/staff/login', label: 'Staff' },
  { to: '/admin', label: 'Admin' },
  { to: '/kiosk', label: 'Kiosk' },
  { to: '/display/dept-gm', label: 'Display board' },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">MediQueue</h1>
        <ConnectionPill state="connecting" />
      </div>
      <div className="grid w-full max-w-sm gap-3">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="pt-4">
                <CardTitle>{link.label}</CardTitle>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
