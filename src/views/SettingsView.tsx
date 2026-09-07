import { useState } from 'react';
import { User, Bell, Shield, Palette, Layout, Globe, Robot, FloppyDisk, Sun, Moon, Desktop, FolderOpen, GitBranch } from '@phosphor-icons/react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Textarea } from '@/src/components/ui/Input';
import { Avatar } from '@/src/components/ui/Avatar';
import { Separator } from '@/src/components/ui/Separator';
import { Switch } from '@/src/components/ui/Switch';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { useTheme } from '@/src/hooks/useTheme';
import { SettingsApiKeySection } from '@/src/components/SettingsApiKeySection';
import { useToast } from '@/src/components/ui/Toast';
import { isTauri } from '@/src/lib/api';
import { useWorkspaceStore } from '@/src/stores/workspaceStore';
import { useProductStore } from '@/src/stores/productStore';
import { Badge } from '@/src/components/ui/Badge';
import { cn } from '@/src/lib/utils';

const NAV_ITEMS = [
  { id: 'account', icon: User, label: '账号信息', group: '个人设置' },
  { id: 'notifications', icon: Bell, label: '消息通知', group: '个人设置' },
  { id: 'privacy', icon: Shield, label: '隐私与安全', group: '个人设置' },
  { id: 'ai', icon: Robot, label: 'AI 设置', group: '个人设置' },
  { id: 'appearance', icon: Palette, label: '外观主题', group: '系统偏好' },
  { id: 'layout', icon: Layout, label: '界面布局', group: '系统偏好' },
  { id: 'locale', icon: Globe, label: '语言与时区', group: '系统偏好' },
  { id: 'workspace', icon: FolderOpen, label: '工作区与仓库', group: '系统偏好' },
];

export function SettingsView() {
  const [activeSection, setActiveSection] = useState('account');
  const [desktopNotify, setDesktopNotify] = useState(true);

  // Group nav items
  const groups = NAV_ITEMS.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof NAV_ITEMS>);

  return (
    <Card className="flex overflow-hidden h-[calc(100vh-140px)] min-h-[600px]">
      {/* Sidebar */}
      <div className="w-56 border-r border-border-subtle bg-bg-secondary/50 p-3 space-y-4 shrink-0">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <h3 className="text-[10px] font-bold text-text-tertiary mb-2 px-3 uppercase tracking-widest">{group}</h3>
            <div className="space-y-0.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-colors',
                    activeSection === item.id
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
                  )}
                >
                  <item.icon size={16} weight={activeSection === item.id ? 'fill' : 'regular'} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-xl">
          {/* Account section (default) */}
          {activeSection === 'account' && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary">账号信息</h2>
                <Button variant="primary" size="sm">
                  <FloppyDisk size={14} weight="bold" />
                  保存修改
                </Button>
              </div>

              <Separator className="mb-6" />

              {/* Avatar */}
              <div className="flex items-center gap-5 pb-6 mb-6 border-b border-border-subtle">
                <Avatar size="xl" fallback="Brandon" className="w-20 h-20 text-2xl" />
                <div>
                  <div className="flex gap-2 mb-2">
                    <Button variant="secondary" size="sm">更换头像</Button>
                    <Button variant="ghost" size="sm" className="text-danger">删除</Button>
                  </div>
                  <p className="text-xs text-text-tertiary">支持 JPG, GIF 或 PNG 格式，最大 2MB</p>
                </div>
              </div>

              {/* Form */}
              <div className="grid grid-cols-2 gap-5">
                <Input label="姓名" defaultValue="Brandon" />
                <Input label="用户名" defaultValue="brandon_dev" />
                <Input label="邮箱地址" type="email" defaultValue="brandon@example.com" className="col-span-2" />
                <Input label="职位/角色" defaultValue="产品经理" />
                <Input label="所在部门" defaultValue="产品研发部" />
                <Textarea label="个人简介" rows={3} defaultValue="关注用户体验与产品创新。" className="col-span-2 resize-none" />
              </div>

              {/* Quick toggles — old 深色模式 Switch removed (now in 外观主题 section) */}
              <Separator className="my-6" />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">桌面通知</p>
                    <p className="text-xs text-text-tertiary">允许系统推送通知</p>
                  </div>
                  <Switch checked={desktopNotify} onCheckedChange={setDesktopNotify} />
                </div>
              </div>
            </>
          )}

          {/* Appearance section (D-01: SegmentedControl bound to useTheme) */}
          {activeSection === 'appearance' && (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-text-primary">外观主题</h2>
              </div>
              <Separator className="mb-6" />
              <AppearanceSection />
            </>
          )}

          {/* Provider/API key management stays inside the existing settings ownership boundary. */}
          {activeSection === 'ai' && <SettingsApiKeySection />}

          {/* 32-05: workspace repo binding (CODE-04) */}
          {activeSection === 'workspace' && <WorkspaceRepoSection />}

          {activeSection === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-text-primary">隐私与安全</h2>
                <p className="text-sm text-text-secondary mt-1">应用不会把 API key 写入 React 持久状态、Zustand 或日志。</p>
              </div>
              <Separator />
              <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-3">
                <p className="text-sm font-medium text-text-primary">API key 管理已集中到 AI 设置</p>
                <p className="text-xs leading-5 text-text-tertiary">每个 provider 的 key 状态和保存入口都在 AI 设置中，桌面端使用系统钥匙串。</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => setActiveSection('ai')}>
                  前往 AI 设置
                </Button>
              </div>
            </div>
          )}

          {/* Other nav items fall through to placeholder */}
          {activeSection !== 'account' && activeSection !== 'appearance' && activeSection !== 'privacy' && activeSection !== 'ai' && activeSection !== 'workspace' && (
            <div className="text-center text-text-tertiary py-20">即将上线</div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* === Appearance Section (D-01: SegmentedControl bound to themeStore via useTheme) === */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">外观主题</p>
          <p className="text-xs text-text-tertiary">选择浅色、深色或跟随系统</p>
        </div>
        <SegmentedControl
          value={theme}
          onChange={(id) => setTheme(id as 'light' | 'dark' | 'system')}
          segments={[
            { id: 'light', label: '浅色', icon: <Sun size={14} weight="duotone" /> },
            { id: 'dark', label: '深色', icon: <Moon size={14} weight="duotone" /> },
            { id: 'system', label: '系统', icon: <Desktop size={14} weight="duotone" /> },
          ]}
        />
      </div>
    </div>
  );
}

/* === Workspace Repo Section (32-05, CODE-04: repo_root binding + dogfood) === */

// 32-06: repo vs workspace path compare — normalize separators + trailing
// slash, case-insensitive (Windows). Non-canonical on purpose: detects the
// user-visible "these are different strings" case, not symlink identity.
function pathsEqual(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

function WorkspaceRepoSection() {
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId));
  // 32-06: product↔workspace relation made visible (minimal).
  const productName = useProductStore((s) =>
    workspace?.projectId ? s.products.find((p) => p.id === workspace.projectId)?.name : undefined,
  );
  const bindRepoRoot = useWorkspaceStore((s) => s.bindRepoRoot);
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const [repoRoot, setRepoRoot] = useState(workspace?.repoRoot ?? '');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const workspaceId = workspace?.id;
  const isDesktop = isTauri();

  const handleBrowse = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') setRepoRoot(selected);
  };

  const handleBind = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    const stored = await bindRepoRoot(workspaceId, repoRoot.trim() || null);
    setBusy(false);
    if (stored === null && repoRoot.trim()) {
      toast({ type: 'error', title: '绑定失败', description: '请检查路径是否为有效目录' });
    } else {
      setRepoRoot(stored ?? '');
      toast({ type: 'success', title: stored ? '已绑定仓库' : '已清除绑定', description: stored ?? undefined });
    }
  };

  const handleDogfood = async () => {
    if (!workspaceId || busy) return;
    setBusy(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const root = await invoke<string | null>('engine_workspace_bind_dev_repo', { workspaceId });
      updateWorkspace(workspaceId, { repoRoot: root ?? undefined });
      setRepoRoot(root ?? '');
      toast({
        type: root ? 'success' : 'error',
        title: root ? '已绑定 Nova 仓库（狗粮）' : '未检测到 Nova 仓库',
        description: root ?? undefined,
      });
    } catch (e) {
      toast({ type: 'error', title: '绑定失败', description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">工作区与仓库</h2>
        <p className="text-sm text-text-secondary mt-1">
          绑定 git 仓库后，agent 的 code_read / code_grep / code_write / code_edit 工具在该仓库范围内可用。
        </p>
      </div>
      {productName && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">关联产品</span>
          <Badge variant="accent">{productName}</Badge>
        </div>
      )}
      <Separator />
      <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-text-primary">当前工作区</p>
          <p className="text-xs text-text-tertiary mt-0.5">{workspace ? `${workspace.name} · ${workspace.folderPath}` : '未选择工作区'}</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="代码仓库根目录 (repo_root)"
              placeholder="例如 D:\Projects\my-repo"
              value={repoRoot}
              onChange={(e) => setRepoRoot(e.target.value)}
              icon={<GitBranch size={16} weight="duotone" />}
              disabled={!isDesktop || !workspaceId}
            />
          </div>
          {isDesktop && (
            <Button variant="secondary" size="md" onClick={() => void handleBrowse()} disabled={!workspaceId}>
              浏览
            </Button>
          )}
          <Button variant="primary" size="md" onClick={() => void handleBind()} disabled={busy || !workspaceId}>
            重绑仓库
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">
          留空并点击「重绑仓库」可清除绑定；未绑定时 coding 工具默认落工作区目录执行。
        </p>
        {repoRoot.trim() && workspace?.folderPath && !pathsEqual(repoRoot.trim(), workspace.folderPath) && (
          <p className="text-xs text-warning">
            仓库根目录与工作区路径不同（工作区是仓库子目录，或绑定到了别处）。
          </p>
        )}
        {import.meta.env.DEV && isDesktop && (
          <div className="flex items-center justify-between rounded-[var(--radius-md)] bg-bg-secondary px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-text-primary">绑定 Nova 仓库（狗粮）</p>
              <p className="text-xs text-text-tertiary">开发模式专属：一键把当前工作区绑定到 Nova 自身仓库。</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void handleDogfood()} disabled={busy}>
              <GitBranch size={14} weight="duotone" />
              一键绑定
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
