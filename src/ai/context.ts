import { useProductStore } from '@/src/stores/productStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useUIStore } from '@/src/stores/uiStore';
import type { CarriedContextItem } from '@/src/stores/uiStore';

type ContextUIState = {
  selectedProductId: string | null;
  theme: string;
};

/** Phase 17 UX-02: snapshot the current view context into uiStore.agentContextCarry. */
export function refreshAgentCarry(): void {
  const ui = useUIStore.getState();
  const items: CarriedContextItem[] = [];

  if (ui.activeTab === 'product-management') {
    const product = useProductStore
      .getState()
      .products.find((item) => item.id === ui.selectedProductId);
    if (product) items.push({ kind: 'product', id: product.id, label: product.name });
  } else if (ui.activeTab === 'tasks') {
    const task = ui.selectedTaskId
      ? useTaskStore
          .getState()
          .categories.flatMap((category) => category.tasks)
          .find((item) => item.id === ui.selectedTaskId)
      : undefined;
    if (task) {
      items.push({ kind: 'task', id: task.id, label: `[${task.priority}] ${task.title}` });
    } else {
      // No selection → carry the actual list filter (view mode + active category)
      items.push({
        kind: 'task',
        label:
          ui.taskKanbanView === 'date'
            ? '任务 · 按日期'
            : ui.taskKanbanCategory
              ? `任务 · ${ui.taskKanbanCategory}`
              : '任务 · 全部分类',
      });
    }
  } else if (ui.activeTab === 'schedule') {
    const todayKey = new Date().toISOString().slice(0, 10);
    const count = useScheduleStore
      .getState()
      .events.filter((event) => event.date === todayKey).length;
    if (count > 0) items.push({ kind: 'schedule', label: '今日日程', count });
  }

  useUIStore.getState().setAgentContextCarry(items);
}

export function buildCoreContext(): string {
  const ui = useUIStore.getState() as ContextUIState;
  const product = useProductStore.getState().products.find(
    (item) => item.id === ui.selectedProductId,
  );
  const tasks = useTaskStore.getState().categories
    .flatMap((category) => category.tasks)
    .filter((task) => task.status !== '已完成' && task.status !== 'done')
    .slice(0, 10);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const endKey = end.toISOString().slice(0, 10);
  const events = useScheduleStore.getState().events
    .filter((event) => event.date >= todayKey && event.date <= endKey)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 5);

  const lines = ['# Current Context', '## Selected Product'];
  lines.push(
    product
      ? `- Name: ${product.name} | Stage: ${product.stage} | Tagline: ${product.tagline}`
      : '- (none selected)',
  );

  lines.push('## Active Tasks (top 10)');
  if (tasks.length === 0) {
    lines.push('- (no active tasks)');
  } else {
    for (const task of tasks) {
      const productLabel = task.project ? ` [product: ${task.project}]` : '';
      lines.push(`- [${task.priority}] ${task.title} (deadline ${task.deadline || 'N/A'})${productLabel}`);
    }
  }

  lines.push('## Upcoming Events (next 7 days, top 5)');
  if (events.length === 0) {
    lines.push('- (no upcoming events)');
  } else {
    for (const event of events) {
      lines.push(`- ${event.date} ${event.time} ${event.title} (${event.type})`);
    }
  }

  // Phase 17 UX-02: carried context rides the SAME core segment/clamp — no second
  // assembler path. Product items are skipped (## Selected Product covers them).
  const carry = useUIStore.getState().agentContextCarry;
  const carryLines: string[] = [];
  for (const item of carry) {
    if (item.kind === 'task') {
      carryLines.push(`- Selected Task: ${item.label}`);
    } else if (item.kind === 'schedule') {
      const todayEvents = useScheduleStore
        .getState()
        .events.filter((event) => event.date === todayKey)
        .sort((a, b) => a.time.localeCompare(b.time));
      for (const event of todayEvents) {
        carryLines.push(`- Today: ${event.date} ${event.time} ${event.title}`);
      }
    }
  }
  if (carryLines.length > 0) {
    lines.push('## Carried Context', ...carryLines);
  }

  lines.push('## User Preferences', `- Theme: ${ui.theme}`);
  return lines.join('\n');
}
