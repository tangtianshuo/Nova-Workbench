// src/components/HydrationGate.tsx
// Per D-12. Renders skeleton until all 6 stores report _hasHydrated = true.
// ponytail: 6 booleans + && is simpler than a state machine. Reuses the
// ViewLoading skeleton markup from App.tsx (kept in sync visually).
import { ReactNode } from 'react';
import { useProductStore } from '@/src/stores/productStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useRndStore } from '@/src/stores/rndStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useUIStore } from '@/src/stores/uiStore';
import { Skeleton } from '@/src/components/ui/Skeleton';

function HydrationLoading() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton variant="text" width="30%" />
      <Skeleton variant="rect" height={40} />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton variant="card" height={120} />
        <Skeleton variant="card" height={120} />
        <Skeleton variant="card" height={120} />
      </div>
    </div>
  );
}

export function HydrationGate({ children }: { children: ReactNode }) {
  // Keep every store hook unconditional. A short-circuiting `&&` chain would
  // skip later hooks while the first store is still hydrating and change the
  // hook order on the next render.
  const productHydrated = useProductStore((s) => s._hasHydrated);
  const taskHydrated = useTaskStore((s) => s._hasHydrated);
  const rndHydrated = useRndStore((s) => s._hasHydrated);
  const scheduleHydrated = useScheduleStore((s) => s._hasHydrated);
  const workspaceHydrated = useWorkspaceStore((s) => s._hasHydrated);
  const uiHydrated = useUIStore((s) => s._hasHydrated);
  const allHydrated = [
    productHydrated,
    taskHydrated,
    rndHydrated,
    scheduleHydrated,
    workspaceHydrated,
    uiHydrated,
  ].every(Boolean);
  return allHydrated ? <>{children}</> : <HydrationLoading />;
}
