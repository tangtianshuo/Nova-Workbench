import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { type ElementType, useEffect, useState } from 'react';
import { ChatPanel } from '@/src/components/ChatPanel';
import { useUIStore } from '@/src/stores/uiStore';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { useTabRunStore } from '@/src/stores/tabRunStore';
import { selectPendingCount } from '@/src/ai/pendingCount';
import { kbdHint } from '@/src/lib/api';
import {
  Robot,
  CheckSquare,
  Stack,
  Calendar,
  Folder,
  BookOpen,
  FlowArrow,
  Gear,
  Cpu,
  Cube,
  Sparkle,
} from '@phosphor-icons/react';

interface MenuItem {
  id: string;
  icon: ElementType;
  label: string;
  subtitle?: string;
  isNew?: boolean;
}

interface SidebarProps {
  activeTab: string;
  onTabChange: (id: string) => void;
  menuItems: MenuItem[];
}

export function Sidebar({ activeTab, onTabChange, menuItems }: SidebarProps) {
  const setChatPanelOpen = useUIStore((state) => state.setChatPanelOpen);
  const pendingCount = usePendingCount();

  return (
    <>
      <aside
        className={cn(
          'w-[var(--sidebar-w)] flex flex-col h-full shrink-0',
          'glass-subtle border-r border-border-subtle',
        )}
      >
        {/* Logo */}
        <div className="px-5 py-4 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent flex items-center justify-center">
            <Cube size={16} weight="fill" className="text-white" />
          </div>
          <span className="text-md font-semibold tracking-tight text-text-primary">
            Nova
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => setChatPanelOpen(true)}
            aria-label="打开 AI 助手"
            className={cn(
              'w-full flex items-center gap-2.5 px-2.5 py-2 mb-3 rounded-[var(--radius-md)]',
              'bg-accent/10 text-accent hover:bg-accent/20 transition-colors',
              'text-sm font-medium cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
            )}
          >
            <Sparkle size={17} weight="duotone" />
            <span>AI 助手</span>
            <span className="ml-auto text-[10px] text-text-tertiary font-mono">{kbdHint('K')}</span>
          </button>

          {menuItems.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              isActive={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
              badge={item.id === 'agent' ? pendingCount : undefined}
            />
          ))}

          {/* Section divider */}
          <div className="pt-4 pb-1 px-3">
            <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">
              产研工坊
            </span>
          </div>

          <SidebarItem
            item={{
              id: 'rnd-center',
              icon: Cpu,
              label: '产品研发中心',
            }}
            isActive={activeTab === 'rnd-center'}
            onClick={() => onTabChange('rnd-center')}
            accent
          />
        </nav>

        {/* User card */}
        <div className="px-3 py-3 border-t border-border-subtle">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] hover:bg-bg-secondary transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xs font-semibold">
              BR
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary text-truncate">Brandon</p>
              <p className="text-[11px] text-text-tertiary text-truncate">产品总监</p>
            </div>
          </div>
        </div>
      </aside>
      <ChatPanel />
    </>
  );
}

/* === Agent 待确认计数(Sidebar 红点数据源)== */
function usePendingCount(): number {
  const [count, setCount] = useState(() =>
    selectPendingCount(
      useChatConsoleStore.getState(),
      useTabRunStore.getState().pendingDeliverables,
    ),
  );
  useEffect(() => {
    const read = () =>
      selectPendingCount(
        useChatConsoleStore.getState(),
        useTabRunStore.getState().pendingDeliverables,
      );
    const unsubConsole = useChatConsoleStore.subscribe(() => setCount(read()));
    const unsubTabRun = useTabRunStore.subscribe(() => setCount(read()));
    return () => {
      unsubConsole();
      unsubTabRun();
    };
  }, []);
  return count;
}

/* === Sidebar Item === */
interface SidebarItemProps {
  item: MenuItem;
  isActive: boolean;
  onClick: () => void;
  accent?: boolean;
  badge?: number;
}

function SidebarItem({ item, isActive, onClick, accent, badge }: SidebarItemProps) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] relative',
        'text-sm font-medium cursor-pointer select-none',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30',
        isActive
          ? accent
            ? 'text-accent'
            : 'text-text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
      )}
    >
      {/* Animated background indicator */}
      {isActive && (
        <motion.div
          layoutId="sidebar-active-bg"
          className={cn(
            'absolute inset-0 rounded-[var(--radius-md)]',
            accent ? 'bg-accent/10' : 'bg-bg-secondary'
          )}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}

      <Icon
        size={18}
        weight={isActive ? 'duotone' : 'regular'}
        className={cn(
          'relative z-10 shrink-0',
          isActive && accent && 'text-accent',
          isActive && !accent && 'text-text-primary',
        )}
      />
      <span className="relative z-10 text-truncate">{item.label}</span>
      {(badge ?? 0) > 0 && (
        <span className="relative z-10 ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-white">
          {badge}
        </span>
      )}
      {item.isNew && (
        <span className="relative z-10 ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-subtle text-accent">
          新
        </span>
      )}
    </button>
  );
}

/* === Menu Items Definition === */
export const MENU_ITEMS: MenuItem[] = [
  { id: 'agent', icon: Robot, label: 'Agent 工作区', subtitle: '智能问答 / 任务自动化 / 工具集成' },
  { id: 'tasks', icon: CheckSquare, label: '任务管理', subtitle: '高效流转 / 智能协同 / 结果驱动', isNew: true },
  { id: 'product-management', icon: Stack, label: '产品管理', subtitle: '全生命周期总览 / 阶段管控 / 文档中心' },
  { id: 'schedule', icon: Calendar, label: '日常管理', subtitle: '时间规划 / 会议安排 / 事项提醒' },
  { id: 'files', icon: Folder, label: '文件归档', subtitle: '工作区管理 / 本地文件索引' },
  { id: 'knowledge', icon: BookOpen, label: '知识库', subtitle: '经验总结 / 最佳实践 / 团队财富' },
  { id: 'workflows', icon: FlowArrow, label: '工作流', subtitle: '模板库 / 参考剧本 / 一次发起', isNew: true },
  { id: 'settings', icon: Gear, label: '设置中心', subtitle: '系统配置 / 权限管理 / 个性化' },
];
