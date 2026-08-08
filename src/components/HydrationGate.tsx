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
  const allHydrated =
    useProductStore((s) => s._hasHydrated) &&
    useTaskStore((s) => s._hasHydrated) &&
    useRndStore((s) => s._hasHydrated) &&
    useScheduleStore((s) => s._hasHydrated) &&
    useWorkspaceStore((s) => s._hasHydrated) &&
    useUIStore((s) => s._hasHydrated);
  return allHydrated ? <>{children}</> : <HydrationLoading />;
}
