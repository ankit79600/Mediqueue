import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
