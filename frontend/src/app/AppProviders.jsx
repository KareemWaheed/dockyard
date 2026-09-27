import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '@/app/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { DialogProvider } from '@/app/DialogProvider';

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="bottom-right" closeButton />;
}

export function AppProviders({ queryClient, children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider delayDuration={300}>
          <DialogProvider>
            {children}
            <ThemedToaster />
          </DialogProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
