import { useState } from 'react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { isValidTag } from '@/features/container/suggestions';

export function TagCombobox({ groups, initialQuery = '', onPick, onQueryChange }) {
  const [query, setQuery] = useState(initialQuery);
  const typed = query.trim();
  const known = groups.some((g) => g.items.some((i) => i.tag === typed));
  const showTyped = typed && !known;

  const handleQueryChange = (value) => {
    setQuery(value);
    onQueryChange?.(value.trim());
  };

  return (
    // cmdk's <Input> gets its accessible name from the Command root's hidden
    // <label>, referenced via aria-labelledby (which wins over aria-label on
    // the input itself) — so the name has to be set here, not on CommandInput.
    <Command className="rounded-lg border" loop label="Tag to deploy">
      <CommandInput autoFocus aria-label="Tag to deploy" placeholder="Tag to deploy…" value={query} onValueChange={handleQueryChange} />
      <CommandList className="max-h-64">
        {groups.map((g) => (
          <CommandGroup key={g.heading} heading={g.heading}>
            {g.items.map((i) => (
              <CommandItem
                key={i.tag}
                value={`${i.tag} ${i.hint}`}
                onSelect={() => {
                  setQuery(i.tag);
                  onPick(i.tag);
                }}
              >
                <span className="font-mono text-[12.5px]">{i.tag}</span>
                <span className="ml-auto text-xs text-muted-foreground">{i.hint}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {showTyped && (
          <CommandGroup heading="Custom" forceMount>
            {isValidTag(typed) ? (
              <CommandItem forceMount value={`__typed__ ${typed}`} onSelect={() => onPick(typed)}>
                Use <span className="font-mono text-[12.5px]">{typed}</span>
              </CommandItem>
            ) : (
              <p className="px-2 py-1.5 text-xs text-bad">Not a valid image tag</p>
            )}
          </CommandGroup>
        )}
        {!showTyped && groups.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No suggestions. Type a tag.</p>}
      </CommandList>
    </Command>
  );
}
