import { PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLayout } from '@/app/layoutContext';

export function PageHeader({ title, subtitle, children }) {
  const { activityOpen, toggleActivity } = useLayout();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-card px-6 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="outline" size="icon" className="size-8" aria-label="Activity (a)" aria-pressed={activityOpen} onClick={toggleActivity}>
          <PanelRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
