// Phase 17 Plan 02 (UX-02) — ⌘K context carry: refreshAgentCarry derivation +
// buildCoreContext `## Carried Context` injection (same core segment, no second
// assembler path). Stores are seeded directly via setState — no Tauri deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCoreContext, refreshAgentCarry } from '../context';
import { useUIStore } from '@/src/stores/uiStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useProductStore } from '@/src/stores/productStore';
import type { Product, Task } from '@/src/data/mockTasks';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    title: '写周报',
    priority: 'high',
    status: '进行中',
    description: '',
    project: '',
    assignee: 'Brandon',
    assigneeAvatar: 'BR',
    deadline: '',
    aiSuggestions: [],
    ...overrides,
  };
}

const todayKey = new Date().toISOString().slice(0, 10);

function resetUI() {
  useUIStore.setState({
    activeTab: 'tasks',
    selectedTaskId: null,
    selectedProductId: null,
    agentContextCarry: [],
    taskKanbanView: 'category',
    taskKanbanCategory: null,
  });
}

test('refreshAgentCarry: tasks tab + selected task carries id and [priority] title label', () => {
  resetUI();
  useUIStore.setState({ activeTab: 'tasks', selectedTaskId: 't1' });
  useTaskStore.setState({
    categories: [{ id: 'c1', name: '设计', color: 'bg-blue-500', tasks: [makeTask({})] }],
  });
  refreshAgentCarry();
  const carry = useUIStore.getState().agentContextCarry;
  assert.equal(carry.length, 1);
  assert.equal(carry[0].kind, 'task');
  assert.equal(carry[0].id, 't1');
  assert.ok(carry[0].label.includes('写周报'), 'label contains task title');
  assert.ok(carry[0].label.includes('high'), 'label contains task priority');
});

test('buildCoreContext: carried task emits `- Selected Task: <label>` under ## Carried Context', () => {
  resetUI();
  useUIStore.setState({ agentContextCarry: [{ kind: 'task', id: 't1', label: '[高] 写周报' }] });
  const out = buildCoreContext();
  assert.ok(out.includes('## Carried Context'));
  assert.ok(out.includes('- Selected Task: [高] 写周报'));
});

test('buildCoreContext: schedule carry lists today events as `- Today: date time title`', () => {
  resetUI();
  useScheduleStore.setState({
    events: [
      { id: 'e1', title: '需求评审会', time: '10:00 - 11:30', date: todayKey, type: 'meeting', location: '' },
      { id: 'e2', title: '设计走查', time: '14:00', date: todayKey, type: 'review', location: '' },
    ],
  });
  useUIStore.setState({ agentContextCarry: [{ kind: 'schedule', label: '今日日程', count: 2 }] });
  const out = buildCoreContext();
  assert.ok(out.includes('## Carried Context'));
  assert.ok(out.includes(`- Today: ${todayKey} 10:00 - 11:30 需求评审会`));
  assert.ok(out.includes(`- Today: ${todayKey} 14:00 设计走查`));
});

test('buildCoreContext: empty carry adds no ## Carried Context section (zero pollution)', () => {
  resetUI();
  useUIStore.setState({ agentContextCarry: [] });
  assert.equal(buildCoreContext().includes('## Carried Context'), false);
});

test('refreshAgentCarry: schedule tab with zero events today produces no carry item', () => {
  resetUI();
  useUIStore.setState({ activeTab: 'schedule' });
  useScheduleStore.setState({ events: [] });
  refreshAgentCarry();
  assert.deepEqual(useUIStore.getState().agentContextCarry, []);
});

test('refreshAgentCarry: product-management tab carries selected product; buildCoreContext adds no new product line', () => {
  resetUI();
  useUIStore.setState({ activeTab: 'product-management', selectedProductId: 'p1' });
  // context.ts reads only id/name/stage/tagline — a minimal cast seed is enough.
  useProductStore.setState({
    products: [{ id: 'p1', name: 'Nova 产品', stage: '研发中', tagline: 'AI 工作台' } as unknown as Product],
  });
  refreshAgentCarry();
  assert.deepEqual(useUIStore.getState().agentContextCarry, [
    { kind: 'product', id: 'p1', label: 'Nova 产品' },
  ]);
  // Existing `## Selected Product` section covers it — no Carried Context output for product items.
  assert.equal(buildCoreContext().includes('## Carried Context'), false);
});

test('refreshAgentCarry: tasks fallback (no selection) carries view mode + active category name', () => {
  resetUI();
  useTaskStore.setState({ categories: [] });

  // (a) category view + active category
  useUIStore.setState({ taskKanbanView: 'category', taskKanbanCategory: '设计' });
  refreshAgentCarry();
  assert.deepEqual(useUIStore.getState().agentContextCarry, [{ kind: 'task', label: '任务 · 设计' }]);

  // (b) category view + no active category
  useUIStore.setState({ taskKanbanCategory: null });
  refreshAgentCarry();
  assert.deepEqual(useUIStore.getState().agentContextCarry, [{ kind: 'task', label: '任务 · 全部分类' }]);

  // (c) date view
  useUIStore.setState({ taskKanbanView: 'date' });
  refreshAgentCarry();
  assert.deepEqual(useUIStore.getState().agentContextCarry, [{ kind: 'task', label: '任务 · 按日期' }]);
});

test('setTaskKanbanView("date") clears taskKanbanCategory (store setter linkage)', () => {
  resetUI();
  useUIStore.setState({ taskKanbanCategory: '设计' });
  useUIStore.getState().setTaskKanbanView('date');
  assert.equal(useUIStore.getState().taskKanbanCategory, null);
});
