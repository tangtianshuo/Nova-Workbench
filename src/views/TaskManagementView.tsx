import { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { StatsRow } from '../components/StatsRow';
import { TaskKanban } from '../components/TaskKanban';
import { AIAssistantPanel } from '../components/AIAssistantPanel';
import { Button } from '@/src/components/ui/Button';
import { TaskDialog } from '@/src/components/TaskDialog';
import { useApp } from '../store/AppContext';
import type { Task } from '../data/mockTasks';
import { useUIStore } from '@/src/stores/uiStore';

export function TaskManagementView() {
  const { categories } = useApp();
  const selectedTaskId = useUIStore((state) => state.selectedTaskId);
  const setSelectedTaskId = useUIStore((state) => state.setSelectedTaskId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  return (
    <>
      <StatsRow />
      <div className="flex items-center justify-between px-1">
        <h1 className="text-lg font-semibold text-text-primary">任务管理</h1>
        <Button variant="primary" size="sm" onClick={() => { setEditingTask(undefined); setDialogOpen(true); }}>
          <Plus size={14} weight="duotone" />
          新建任务
        </Button>
      </div>
      <div className="flex gap-6 h-[calc(100vh-220px)] min-h-[400px]">
         {/* Main Content Area - Full width for Kanban */}
         <div className="flex-1 flex flex-col gap-6 min-w-0">
             <TaskKanban
               className="flex-1 w-full"
               categories={categories}
               selectedTaskId={selectedTaskId}
               onSelectTask={setSelectedTaskId}
             />
         </div>
      </div>
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editingTask ? 'edit' : 'create'}
        task={editingTask}
      />
    </>
  );
}
