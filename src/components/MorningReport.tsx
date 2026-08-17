// Morning report (17-03 / UX-03) — structured daily brief rendered above the agent console.
// Pure local data queries, zero LLM. Shows once per local day on AgentWorkspaceView mount.
import { useEffect, useState } from 'react';
import { Brain, CalendarDots, CaretDown, CaretUp, Sparkle, Warning } from '@phosphor-icons/react';
import { Card, Button } from '@/src/components/ui';
import { useScheduleStore } from '@/src/stores/scheduleStore';
import { useTaskStore } from '@/src/stores/taskStore';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { useUIStore } from '@/src/stores/uiStore';
import { selectOverdueTasks, selectTodayEvents } from '@/src/stores/reportSelectors';
import { getMemoryStore, type MemoryCandidate } from '@/src/ai/memoryStore';

const STAMP_KEY = 'morning-report:last-shown';

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatChineseDate = (d: Date) =>
  `${d.getMonth() + 1}月${d.getDate()}日 星期${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}`;

const ROW_CLASS =
  'flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-secondary';

export function MorningReport() {
  const [today] = useState(() => new Date());
  const todayKey = localDateKey(today);
  // Daily semantics: first View mount per local day counts (empty report included); later mounts render null.
  const [isDue] = useState(() => localStorage.getItem(STAMP_KEY) !== todayKey);
  const [collapsed, setCollapsed] = useState(
    () => useChatConsoleStore.getState().messages.length > 0,
  );
  const [memoryPending, setMemoryPending] = useState<MemoryCandidate[]>([]);
  const hasConversation = useChatConsoleStore((s) => s.messages.length > 0);
  const eventsInput = useScheduleStore((s) => s.events);
  const categories = useTaskStore((s) => s.categories);

  const events = selectTodayEvents(eventsInput, todayKey);
  const overdue = selectOverdueTasks(categories.flatMap((c) => c.tasks), today);

  useEffect(() => {
    if (isDue) localStorage.setItem(STAMP_KEY, todayKey);
  }, [isDue, todayKey]);

  useEffect(() => {
    let alive = true;
    getMemoryStore()
      .listPending()
      .then((rows) => {
        if (alive) setMemoryPending(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Conversation starting auto-collapses the hero to the top bar.
  useEffect(() => {
    if (hasConversation) setCollapsed(true);
  }, [hasConversation]);

  if (!isDue) return null;
  if (events.length === 0 && overdue.length === 0 && memoryPending.length === 0) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border border-border-subtle bg-bg-primary px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-bg-secondary"
      >
        <Sparkle size={14} weight="duotone" className="text-accent" />
        <span className="font-medium text-text-primary">晨报</span>
        <span className="text-text-tertiary">
          今日日程 {events.length} · 过期任务 {overdue.length} · 待确认 {memoryPending.length}
        </span>
        <CaretDown size={12} className="ml-auto shrink-0" />
      </button>
    );
  }

  const jumpToSchedule = () => useUIStore.getState().setActiveTab('schedule');
  const jumpToTask = (id: string) => {
    const ui = useUIStore.getState();
    ui.setActiveTab('tasks');
    ui.setSelectedTaskId(id);
  };
  const openChatPanel = () => useUIStore.getState().setChatPanelOpen(true);

  return (
    <Card variant="default" className="p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkle size={16} weight="duotone" className="text-accent" />
          <span className="text-sm font-semibold text-text-primary">晨报</span>
          <span className="text-xs text-text-tertiary">{formatChineseDate(today)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(true)} aria-label="收起晨报">
          <CaretUp size={14} />
        </Button>
      </div>
      <div className="mt-4 space-y-4">
        {events.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <CalendarDots size={14} weight="duotone" />
              今日日程
              <span className="text-text-tertiary">({events.length})</span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {events.map((ev) => (
                <button key={ev.id} type="button" onClick={jumpToSchedule} className={ROW_CLASS}>
                  <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{ev.time}</span>
                  <span className="truncate">{ev.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {overdue.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Warning size={14} weight="duotone" className="text-warning" />
              过期任务
              <span className="text-text-tertiary">({overdue.length})</span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {overdue.map((t) => (
                <button key={t.id} type="button" onClick={() => jumpToTask(t.id)} className={ROW_CLASS}>
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-text-tertiary">
                    {t.deadline} · {t.priority}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {memoryPending.length > 0 && (
          <section>
            <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Brain size={14} weight="duotone" />
              待确认记忆候选
              <span className="text-text-tertiary">({memoryPending.length})</span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {memoryPending.map((c) => (
                <button
                  key={c.candidateToken}
                  type="button"
                  onClick={openChatPanel}
                  className={ROW_CLASS}
                >
                  <span className="truncate">{c.content}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Card>
  );
}
