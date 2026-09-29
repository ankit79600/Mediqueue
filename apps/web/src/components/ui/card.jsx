import { cn } from '@/lib/utils.js';

export function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-[#e2e8f0] bg-white shadow-sm shadow-slate-100/80',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-[#0f172a]', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}
