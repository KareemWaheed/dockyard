import React, { useState, useEffect, useRef } from 'react';

export default function SearchableSelect({ value, options, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const select = opt => { onChange(opt); setSearch(''); setOpen(false); };
  return (
    <div className="searchable-select" ref={ref}>
      <input
        className="searchable-select-input"
        value={open ? search : value}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(''); setOpen(true); }}
        placeholder="Search branch…"
      />
      {open && filtered.length > 0 && (
        <div className="searchable-select-dropdown">
          {filtered.map(o => (
            <div key={o} className={`searchable-select-option ${o === value ? 'selected' : ''}`} onMouseDown={() => select(o)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  );
}
