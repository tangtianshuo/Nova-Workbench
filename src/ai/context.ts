import { useProductStore } from '@/src/stores/productStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useUIStore } from '@/src/stores/uiStore';

type ContextUIState = {
  selectedProductId: string | null;
  theme: string;
};

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

  lines.push('## User Preferences', `- Theme: ${ui.theme}`);
  return lines.join('\n');
}
