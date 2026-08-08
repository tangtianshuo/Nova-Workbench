import { useState } from 'react';
import { User, Bell, Shield, Palette, Layout, Globe, FloppyDisk, Sun, Moon, Desktop } from '@phosphor-icons/react';
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
import { cn } from '@/src/lib/utils';

const NAV_ITEMS = [
  { id: 'account', icon: User, label: '账号信息', group: '个人设置' },
  { id: 'notifications', icon: Bell, label: '消息通知', group: '个人设置' },
  { id: 'privacy', icon: Shield, label: '隐私与安全', group: '个人设置' },
  { id: 'appearance', icon: Palette, label: '外观主题', group: '系统偏好' },
  { id: 'layout', icon: Layout, label: '界面布局', group: '系统偏好' },
  { id: 'locale', icon: Globe, label: '语言与时区', group: '系统偏好' },
];

export function SettingsView() {
  const [activeSection, setActiveSection] = useState('account');

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
                <Avatar size="xl" name="Brandon" className="w-20 h-20 text-2xl" />
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
                  <Switch defaultChecked />
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

          {/* Privacy section — API key management (D-07) */}
          {activeSection === 'privacy' && <SettingsApiKeySection />}

          {/* Other nav items fall through to placeholder */}
          {activeSection !== 'account' && activeSection !== 'appearance' && activeSection !== 'privacy' && (
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
