import { WifiOff } from 'lucide-react';
import { useOnline } from '@/lib/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b bg-warn-bg px-4 py-2 text-sm text-warn">
      <WifiOff className="size-4" aria-hidden="true" /> You're offline — data can't refresh.
    </div>
  );
}
