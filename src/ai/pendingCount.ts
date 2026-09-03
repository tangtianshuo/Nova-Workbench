/** 前台确认提醒:统一 pending 计数 + 0→N 转变检测(纯函数,无 React 依赖) */

export interface PendingConsoleFields {
  pendingConfirmation: unknown;
  pendingDestructiveAction: unknown;
  pendingExecApproval: unknown;
  pendingFsWrite: unknown;
  pendingPmWrite: unknown;
  pendingMemory: unknown;
  pendingPrdDraft: unknown;
}

/** 7 个 nullable 字段各算 1(非 null),pendingDeliverables 算 length */
export function selectPendingCount(
  consoleState: PendingConsoleFields,
  pendingDeliverables: unknown[],
): number {
  const fields: (keyof PendingConsoleFields)[] = [
    'pendingConfirmation',
    'pendingDestructiveAction',
    'pendingExecApproval',
    'pendingFsWrite',
    'pendingPmWrite',
    'pendingMemory',
    'pendingPrdDraft',
  ];
  let n = pendingDeliverables.length;
  for (const f of fields) if (consoleState[f] !== null) n += 1;
  return n;
}

/** 仅首卡到达(0→N)弹;挂载快照(已有卡)由 watcher 首次同步只记不弹 */
export function shouldToastOnTransition(prev: number, next: number): boolean {
  return prev === 0 && next > 0;
}
