import { useState } from 'react';
import { StatsRow } from '../components/StatsRow';
import { TaskKanban } from '../components/TaskKanban';
import { AIAssistantPanel } from '../components/AIAssistantPanel';
import { useApp } from '../store/AppContext';

export function TaskManagementView() {
  const { categories } = useApp();
  const [selectedTaskId, setSelectedTaskId] = useState<string>('WXB-2025-001');

  return (
    <>
      <StatsRow />
      <div className="flex gap-6 h-[calc(100vh-220px)] min-h-[700px]">
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
    </>
  );
}

