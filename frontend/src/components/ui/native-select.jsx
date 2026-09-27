import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

// Native <select>: best picker on phones, fully keyboard/AT accessible.
export function NativeSelect({ className, children, ...props }) {
  return (
    <div className={cn('relative', className)}>
      <select
        className="h-10 w-full appearance-none rounded-md border bg-background pr-8 pl-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}
