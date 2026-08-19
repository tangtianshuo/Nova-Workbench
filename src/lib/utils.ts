import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution.
 * Activates the previously-installed clsx + tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Phase 21 (LIST-01): relative time for session list. <60s 刚刚, <60min X 分钟前,
 * <24h X 小时前, <7d X 天前, ≥7d M月D日. Input is an ISO string or Date. */
export function formatRelativeTime(input: string | Date, now: Date = new Date()): string {
  const t = typeof input === 'string' ? new Date(input) : input;
  const sec = Math.max(0, Math.floor((now.getTime() - t.getTime()) / 1000));
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return `${t.getMonth() + 1}月${t.getDate()}日`;
}
