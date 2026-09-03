/**
 * 前台确认提醒 watcher:候选 0→N 到达时弹一次 Toast(带「去确认」跳转)。
 * 卡片渲染仍唯一在 Agent Console 全局队列(D-05);此处仅提醒 + 跳转。
 */
import { useEffect, useRef } from 'react';
import { useChatConsoleStore } from '@/src/stores/chatConsoleStore';
import { useTabRunStore } from '@/src/stores/tabRunStore';
import { useUIStore } from '@/src/stores/uiStore';
import { useToast } from '@/src/components/ui/Toast';
import { selectPendingCount, shouldToastOnTransition } from '@/src/ai/pendingCount';

export function ConfirmationToastWatcher() {
  const { toast } = useToast();
  // 挂载快照只记不弹(StrictMode 双挂载下第二挂载同样只记,无重复 Toast)
  const prevCount = useRef<number | null>(null);

  useEffect(() => {
    const readCount = () =>
      selectPendingCount(
        useChatConsoleStore.getState(),
        useTabRunStore.getState().pendingDeliverables,
      );

    const maybeToast = () => {
      const next = readCount();
      const prev = prevCount.current;
      prevCount.current = next;
      if (prev === null) return; // 首次同步:记录基线,不弹
      if (shouldToastOnTransition(prev, next)) {
        toast({
          type: 'warning',
          title: '待确认操作',
          description: 'Agent 有操作等待你的确认',
          duration: 6000,
          action: {
            label: '去确认',
            onClick: () => useUIStore.getState().setActiveTab('agent'),
          },
        });
      }
    };

    maybeToast(); // 基线快照
    const unsubConsole = useChatConsoleStore.subscribe(maybeToast);
    const unsubTabRun = useTabRunStore.subscribe(maybeToast);
    return () => {
      unsubConsole();
      unsubTabRun();
    };
  }, [toast]);

  return null;
}
