import { useRef } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

// URL-driven run list: every row is a link, so Enter/click/back all work natively.
export function RunList({ label, items, getKey, getHref, isSelected, renderItem, footer }) {
  const listRef = useRef(null);
  const onKeyDown = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const links = [...listRef.current.querySelectorAll('a[data-run-link]')];
    const i = links.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
    links[next].focus();
  };
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-auto">
      <ul ref={listRef} onKeyDown={onKeyDown} className="divide-y">
        {items.map((item) => {
          const selected = isSelected(item);
          return (
            <li key={getKey(item)}>
              <Link
                data-run-link
                to={getHref(item)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col justify-center gap-0.5 px-4 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  selected && 'bg-accent text-accent-foreground hover:bg-accent',
                )}
              >
                {renderItem(item)}
              </Link>
            </li>
          );
        })}
      </ul>
      {footer}
    </nav>
  );
}
