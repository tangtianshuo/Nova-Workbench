/**
 * Phase 32 (32-04, CODE-02) — lazy-only unified diff renderer.
 * Default export consumed exclusively via React.lazy (297KB chunk lesson,
 * Phase 31 prismjs). Never import directly from UI components.
 */
import { Diff, Hunk, parseDiff } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import './diff-body.css';
import { cn } from '@/src/lib/utils';

export default function DiffBody({ unifiedText }: { unifiedText: string }) {
  let diff: ReturnType<typeof parseDiff>[number] | undefined;
  try {
    [diff] = parseDiff(unifiedText);
  } catch {
    diff = undefined;
  }
  if (!diff || !diff.hunks || diff.hunks.length === 0) {
    return (
      <div className="rounded-[var(--radius-sm)] bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-tertiary">
        diff 解析失败
      </div>
    );
  }
  return (
    <div className="diff-body overflow-x-auto rounded-[var(--radius-sm)] bg-bg-primary">
      <Diff
        viewType="unified"
        hunks={diff.hunks}
        diffType={diff.type}
        className={cn('font-mono text-xs leading-relaxed')}
      >
        {(hunks) => hunks.map((hunk) => (
          <Hunk key={hunk.content} hunk={hunk} />
        ))}
      </Diff>
    </div>
  );
}
