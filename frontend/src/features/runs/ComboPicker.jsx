import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

export function ComboPicker({ id, options, value, onChange, placeholder, searchLabel, emptyText, mono = false, disabled = false, className }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-10 w-full justify-between font-normal', mono && 'font-mono text-[13px]', className)}
        >
          <span className="truncate">{current?.label ?? (value || placeholder)}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        {/* cmdk names its input via the Command root's label (see TagCombobox). */}
        <Command loop label={searchLabel}>
          <CommandInput autoFocus aria-label={searchLabel} placeholder={`${searchLabel}…`} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <Check className={cn('size-4', o.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                <span className={cn(mono && 'font-mono text-[12.5px]')}>{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
