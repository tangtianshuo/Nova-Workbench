import { Card } from '@/src/components/ui';
import { AgentConsole } from '@/src/components/AgentConsole';

export function AgentWorkspaceView() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--titlebar-h)-var(--header-h)-48px)] w-full max-w-3xl flex-col gap-4">
      {/* MorningReport 由 17-03 插入此处 */}
      <Card variant="glass" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AgentConsole layout="page" />
      </Card>
    </div>
  );
}
