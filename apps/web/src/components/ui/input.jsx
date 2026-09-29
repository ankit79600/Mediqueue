import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-xl border border-[#cbd5e1] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
