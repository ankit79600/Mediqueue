import { cn } from '@/lib/utils.js';

export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border border-slate-200 bg-white shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-sm font-semibold text-slate-900', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />;
}
