import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

const VARIANTS = {
  default: 'bg-slate-900 text-white hover:bg-slate-700',
  outline: 'border border-slate-300 bg-white hover:bg-slate-50',
  destructive: 'bg-red-600 text-white hover:bg-red-500',
  ghost: 'hover:bg-slate-100',
};

export const Button = forwardRef(function Button(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
});
