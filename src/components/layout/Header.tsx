import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/Button';
import { MagnifyingGlass, Bell, Plus, X, Sun, Moon } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from '@/src/components/ui/Dialog';
import { Input, Textarea, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, DatePickerInput } from '@/src/components/ui';
import { useTheme } from '@/src/hooks/useTheme';

interface HeaderProps {
  title: string;
  subtitle: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const { resolved, toggle } = useTheme();

  return (
    <>
      <header
        className={cn(
          'h-[var(--header-h)] flex items-center justify-between px-6 shrink-0',
          'border-b border-border-subtle'
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
          {/* Search */}
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
              ⌘K
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

          {/* New Task */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => setNewTaskOpen(true)}
          >
            <Plus size={14} weight="bold" />
            新增任务
          </Button>
        </div>
      </header>

      {/* === Search Dialog === */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
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

      {/* === New Task Dialog === */}
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} />
    </>
  );
}

/* === New Task Dialog === */
function NewTaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader
          title="手动新增任务"
          description="创建一个新的任务到看板中"
        />
        <DialogBody>
          <Input label="任务标题" placeholder="输入任务名称..." />
          <Textarea label="任务描述" placeholder="描述任务内容..." rows={3} />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              任务分类
            </label>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择分类..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="requirement">需求评审</SelectItem>
                <SelectItem value="design">产品设计</SelectItem>
                <SelectItem value="development">开发任务</SelectItem>
                <SelectItem value="testing">测试验收</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">
                优先级
              </label>
              <Select>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择优先级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DatePickerInput label="截止日期" />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            创建任务
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
