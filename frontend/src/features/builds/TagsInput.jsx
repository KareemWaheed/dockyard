import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { addTags } from '@/features/builds/buildArgs';

// onDraftChange reports the text not yet turned into a chip, so the form can count it as entered
// (see withPendingTags) — Build stays usable after typing one tag without pressing Enter.
export function TagsInput({ id, value, onChange, onDraftChange, placeholder, required }) {
  const tags = Array.isArray(value) ? value : [];
  const [draft, setDraftState] = useState('');
  const [error, setError] = useState('');
  const setDraft = (text) => {
    setDraftState(text);
    onDraftChange?.(text);
  };
  // On unmount, clear the reported draft so the form never counts text the user can no longer see.
  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; });
  useEffect(() => () => onDraftChangeRef.current?.(''), []);

  const commit = (text) => {
    const { tags: next, invalid } = addTags(tags, text);
    if (next.length !== tags.length) onChange(next);
    setError(invalid.length ? `Not a valid image tag: ${invalid.join(', ')}` : '');
    setDraft(invalid.join(','));
  };

  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input px-2 py-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
        {tags.map((t) => (
          <Badge key={t} variant="secondary" className="h-7 gap-1 rounded-md pr-1 font-mono text-xs">
            {t}
            <button type="button" className="rounded-sm p-0.5 hover:text-bad" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <input
          id={id}
          className="h-7 min-w-32 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          value={draft}
          aria-invalid={!!error}
          aria-required={required}
          onChange={(e) => { setDraft(e.target.value); setError(''); }}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,\s]/.test(text.trim())) { e.preventDefault(); commit(`${draft},${text}`); }
          }}
          placeholder={tags.length ? '' : placeholder || 'Type a tag, press Enter'}
        />
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
    </div>
  );
}
