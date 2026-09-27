import { cn } from '@/lib/utils';

// Brand colours are fixed (the logo must look the same everywhere), so they are literals here
// rather than theme tokens. Keep in sync with public/favicon.svg.
const NAVY = '#0b1622';
const STEEL = '#e8eef5';
const ORANGE = '#ff7a1a';

// "Gantry D": a quay crane whose mast and boom form a D, lifting a container.
// Without `tile` the strokes follow the text colour (currentColor) so it works in both themes.
export function DockyardLogo({ tile = false, title, className }) {
  const fg = tile ? STEEL : 'currentColor';
  return (
    <svg
      data-logo="gantry-d"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      {tile && <rect width="64" height="64" rx="14" fill={NAVY} />}
      <path d="M19 51 V13 H31 A19 19 0 0 1 50 32" fill="none" stroke={fg} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 51 H52" stroke={fg} strokeWidth="5" strokeLinecap="round" />
      <path d="M36 15 V26" stroke={fg} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="27" y="26" width="18" height="12" rx="1.6" fill={ORANGE} />
      {[31.5, 36, 40.5].map((x) => (
        <line key={x} x1={x} y1="28.5" x2={x} y2="35.5" stroke={NAVY} strokeOpacity=".38" strokeWidth="1.6" />
      ))}
    </svg>
  );
}
