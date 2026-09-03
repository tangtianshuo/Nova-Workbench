// Milkdown toolbar — all Nova tokens + Phosphor icons (D-01).
// Commands are the 7.22.1 .d.ts-verified keys (research MEDIUM item resolved:
// heading command is `wrapInHeadingCommand`, not turnIntoHeadingCommand).
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import {
  wrapInHeadingCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
  toggleLinkCommand,
} from '@milkdown/kit/preset/commonmark';
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm';
import { callCommand } from '@milkdown/kit/utils';
import type { CmdKey } from '@milkdown/core';
import { useInstance } from '@milkdown/react';
import type { ReactNode } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Code,
  CodeBlock,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  Table,
  TextB,
  TextItalic,
  TextStrikethrough,
} from '@phosphor-icons/react';
import { Button } from './Button';
import { Separator } from './Separator';
import { Tooltip } from './Tooltip';

type Instance = ReturnType<typeof useInstance>[1];

function run(getInstance: Instance, key: CmdKey<unknown>, payload?: unknown) {
  const ed = getInstance();
  ed?.action(callCommand(key, payload));
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 px-0 text-text-secondary hover:text-text-primary"
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()} // keep editor selection/focus
        onClick={onClick}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

export function MarkdownToolbar() {
  const [, getInstance] = useInstance();
  const runCmd = (key: CmdKey<unknown>, payload?: unknown) => () => run(getInstance, key, payload);

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 border-b border-border-subtle bg-bg-secondary px-2 py-1"
      role="toolbar"
    >
      <ToolbarButton label="撤销" onClick={runCmd(undoCommand.key)}>
        <ArrowCounterClockwise size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="重做" onClick={runCmd(redoCommand.key)}>
        <ArrowClockwise size={14} weight="duotone" />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-4" />
      {([1, 2, 3] as const).map((level) => (
        <ToolbarButton
          key={level}
          label={`标题 ${level}`}
          onClick={runCmd(wrapInHeadingCommand.key, level)}
        >
          <span className="text-xs font-semibold">H{level}</span>
        </ToolbarButton>
      ))}
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ToolbarButton label="粗体" onClick={runCmd(toggleStrongCommand.key)}>
        <TextB size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="斜体" onClick={runCmd(toggleEmphasisCommand.key)}>
        <TextItalic size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="删除线" onClick={runCmd(toggleStrikethroughCommand.key)}>
        <TextStrikethrough size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="行内代码" onClick={runCmd(toggleInlineCodeCommand.key)}>
        <Code size={14} weight="duotone" />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ToolbarButton label="无序列表" onClick={runCmd(wrapInBulletListCommand.key)}>
        <ListBullets size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="有序列表" onClick={runCmd(wrapInOrderedListCommand.key)}>
        <ListNumbers size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="引用" onClick={runCmd(wrapInBlockquoteCommand.key)}>
        <Quotes size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="代码块" onClick={runCmd(createCodeBlockCommand.key)}>
        <CodeBlock size={14} weight="duotone" />
      </ToolbarButton>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <ToolbarButton label="链接" onClick={runCmd(toggleLinkCommand.key, { href: '' })}>
        <LinkSimple size={14} weight="duotone" />
      </ToolbarButton>
      <ToolbarButton label="表格 (3x3)" onClick={runCmd(insertTableCommand.key, { row: 3, col: 3 })}>
        <Table size={14} weight="duotone" />
      </ToolbarButton>
    </div>
  );
}
