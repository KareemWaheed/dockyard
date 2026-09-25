import { Toaster as Sonner } from 'sonner';

// Theme comes from the `dark` class on <html> (set by ThemeProvider); sonner reads it via `theme="system"`
// only for OS changes, so pass the resolved theme explicitly from the caller.
function Toaster({ theme = 'light', ...props }) {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{
        '--normal-bg': 'var(--popover)',
        '--normal-text': 'var(--popover-foreground)',
        '--normal-border': 'var(--border)',
      }}
      {...props}
    />
  );
}

export { Toaster };
