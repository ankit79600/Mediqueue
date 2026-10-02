import { Link } from 'react-router-dom';
import { Activity, Smartphone, Stethoscope, LayoutDashboard, Monitor, Tv2, ArrowRight, Clock, Users, Zap } from 'lucide-react';
import SoftAurora from '@/components/SoftAurora.jsx';

const ROLES = [
  {
    to: '/patient/login',
    icon: Smartphone,
    label: 'Patient',
    description: 'Book a slot, join the queue, and track your turn live.',
    color: '#0284c7',
    bg: '#e0f2fe',
  },
  {
    to: '/staff/login',
    icon: Stethoscope,
    label: 'Staff / Doctor',
    description: 'Manage your queue — call, skip, complete, or mark no-show.',
    color: '#059669',
    bg: '#d1fae5',
  },
  {
    to: '/admin',
    icon: LayoutDashboard,
    label: 'Admin',
    description: 'Live hospital-wide stats, department load, and SMS logs.',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
];

const SECONDARY = [
  { to: '/kiosk', icon: Monitor, label: 'Kiosk' },
  { to: '/display/dept-gm', icon: Tv2, label: 'Display board' },
];

const FEATURES = [
  { icon: Clock, text: 'Real-time ETA updates' },
  { icon: Users, text: '4 departments · 6 doctors' },
  { icon: Zap, text: 'Live socket connection' },
];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb]">
      {/* Aurora background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SoftAurora speed={0.15} brightness={0.45} color1="#bfdbfe" color2="#a5f3fc" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-16">
        {/* Hero */}
        <div className="mb-12 flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[#0284c7] shadow-lg shadow-[#0284c7]/30">
            <Activity className="size-8 text-white" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-[#0f172a] sm:text-5xl">
              MediQueue
            </h1>
            <p className="mt-2 text-lg text-[#5b6b82]">
              Skip the wait. Track your turn.
            </p>
          </div>

          {/* Feature pills */}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {FEATURES.map(({ icon: Icon, text }) => (
              <span
                key={text}
                className="flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white/70 px-3 py-1 text-xs font-medium text-[#5b6b82] backdrop-blur-sm"
              >
                <Icon className="size-3" aria-hidden="true" />
                {text}
              </span>
            ))}
          </div>
        </div>

        {/* Role cards */}
        <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          {ROLES.map(({ to, icon: Icon, label, description, color, bg }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col gap-4 rounded-2xl border border-[#e2e8f0] bg-white/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg"
              style={{ '--hover-shadow': `0 8px 24px ${color}22` }}
            >
              <div
                className="flex size-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                style={{ backgroundColor: bg, color }}
              >
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-[#0f172a]">{label}</p>
                <p className="mt-1 text-sm leading-relaxed text-[#5b6b82]">{description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium" style={{ color }}>
                Enter
                <ArrowRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>

        {/* Secondary links */}
        <div className="mt-6 flex items-center gap-2">
          {SECONDARY.map(({ to, icon: Icon, label }, i) => (
            <>
              {i > 0 && <span key={`sep-${i}`} className="text-[#cbd5e1]">·</span>}
              <Link
                key={to}
                to={to}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[#5b6b82] transition-colors hover:bg-white/60 hover:text-[#0284c7]"
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {label}
              </Link>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}
