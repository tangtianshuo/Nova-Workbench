import { useState } from 'react';
import { StatsRow } from '../components/StatsRow';
import { TaskKanban } from '../components/TaskKanban';
import { AIAssistantPanel } from '../components/AIAssistantPanel';
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
  const [defaultCategoryId, setDefaultCategoryId] = useState<string | undefined>();

  return (
    <>
      <StatsRow />
      <div className="flex gap-6 h-[calc(100vh-220px)] min-h-[400px]">
         <div className="flex-1 flex flex-col gap-6 min-w-0">
             <TaskKanban
               className="flex-1 w-full"
               categories={categories}
               selectedTaskId={selectedTaskId}
               onSelectTask={setSelectedTaskId}
               onRequestCreateTask={(catId) => {
                 setEditingTask(undefined);
                 setDefaultCategoryId(catId);
                 setDialogOpen(true);
               }}
             />
         </div>
      </div>
      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={editingTask ? 'edit' : 'create'}
        task={editingTask}
        defaultCategoryId={defaultCategoryId}
      />
    </>
  );
}
