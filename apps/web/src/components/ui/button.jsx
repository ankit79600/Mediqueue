import { forwardRef } from 'react';
import { cn } from '@/lib/utils.js';

const VARIANTS = {
  default: 'bg-[#0284c7] text-white shadow-sm hover:bg-[#0369a1] focus-visible:outline-2 focus-visible:outline-[#0284c7]',
  outline: 'border border-[#e2e8f0] bg-white hover:border-[#0284c7]/40 hover:bg-[#e0f2fe]/50',
  destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-500',
  ghost: 'hover:bg-[#eef2f7] text-[#0f172a]',
  secondary: 'bg-[#e0f2fe] text-[#075985] hover:bg-[#bae6fd]',
};

const SIZES = {
  default: 'px-4 py-2 text-sm',
  sm: 'px-3 py-1.5 text-xs',
  lg: 'px-5 py-2.5 text-base h-11',
  icon: 'size-9 p-0',
};

export const Button = forwardRef(function Button(
  { className, variant = 'default', size = 'default', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});
