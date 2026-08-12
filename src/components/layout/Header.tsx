import { Button } from '@/src/components/ui/Button';
import { MagnifyingGlass, Bell, Sun, Moon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogBody } from '@/src/components/ui/Dialog';
import { Input } from '@/src/components/ui';
import { useTheme } from '@/src/hooks/useTheme';
import { useUIStore } from '@/src/stores/uiStore';
import { kbdHint } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';

interface HeaderProps {
  title: string;
  subtitle: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { resolved, toggle } = useTheme();
  const isSearchOpen = useUIStore((s) => s.isSearchOpen);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  return (
    <>
      <header
        className={cn(
          'h-[var(--header-h)] flex items-center justify-between px-6 shrink-0',
          'border-b border-border-subtle',
        )}
      >
        {/* Left: Title */}
        <div>
          <h1 className="text-md font-semibold text-text-primary tracking-tight">
            {title}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {subtitle}
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Search — opens Search Dialog (same as Ctrl/Cmd+F) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSearchOpen(true)}
            className="gap-1.5 text-text-secondary"
            aria-label="搜索"
          >
            <MagnifyingGlass size={14} weight="duotone" />
            <span>搜索</span>
            <kbd className="ml-1 text-[10px] text-text-tertiary bg-bg-secondary px-1 py-0.5 rounded">
              {kbdHint('F')}
            </kbd>
          </Button>

          {/* Theme toggle — cycles light <-> dark, skips System (D-02) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={resolved === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {resolved === 'dark'
              ? <Sun size={16} weight="duotone" />
              : <Moon size={16} weight="duotone" />}
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            aria-label="通知"
          >
            <Bell size={16} weight="duotone" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-danger rounded-full" />
          </Button>
        </div>
      </header>

      {/* === Search Dialog === */}
      <Dialog open={isSearchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader title="搜索" />
          <DialogBody>
            <Input
              placeholder="搜索任务、产品、文档..."
              icon={<MagnifyingGlass size={16} weight="duotone" />}
              autoFocus
            />
            <div className="text-xs text-text-tertiary mt-2">
              输入关键词开始搜索
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
