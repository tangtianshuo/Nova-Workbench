---
phase: 9-ai
plan: 06
type: execute
wave: 6
depends_on: [9-05]
files_modified:
  - src/components/SettingsAISection.tsx
  - src/views/SettingsView.tsx
  - src/components/SettingsApiKeySection.tsx
  - src/lib/api.ts
  - src/components/CmdKPalette.tsx
  - src/components/ChatPanel.tsx
  - src/stores/uiStore.ts
autonomous: false
requirements: [AI-05, AI-09]

user_setup:
  - service: "DeepSeek API"
    why: "Default LLM provider for Phase 9"
    env_vars:
      - name: DEEPSEEK_API_KEY
        source: "platform.deepseek.com → API Keys"
  - service: "OpenAI / Anthropic / Gemini API"
    why: "Optional alternative providers (BYOK)"
    env_vars:
      - name: OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
        source: "Respective platform dashboards"
  - service: "Ollama (optional)"
    why: "Local LLM fallback (no API key)"
    dashboard_config:
      - task: "Install Ollama + pull llama3.1"
        location: "ollama.com → download, then `ollama pull llama3.1`"

must_haves:
  truths:
    - "SettingsView 加 'AI' 导航项,展示 SettingsAISection"
    - "SettingsAISection 暴露 provider selector (SegmentedControl 或 Select,5 个 provider) + API key 输入 (per-provider)"
    - "切换 provider 时:setActiveProvider invoke + uiStore.activeAIProvider 同步"
    - "CmdKPalette 和 ChatPanel 读 uiStore.activeAIProvider 不再硬编码 'deepseek'"
    - "SettingsApiKeySection 升级:支持 per-provider key (has_provider_key / set_provider_key invoke)"
    - "用户可以跑通端到端:Settings 选 provider + 输 key → CmdK 或 ChatPanel 自然语言 → AI 调用 tool → 看到 result"
  artifacts:
    - path: "src/components/SettingsAISection.tsx"
      provides: "Provider selector + per-provider API key 管理"
      contains: "SettingsAISection"
  key_links:
    - from: "src/components/SettingsAISection.tsx"
      to: "Tauri invoke('set_active_provider') / 'set_provider_key'"
      via: "切换 provider 调用 setActiveProvider + 输入 key 调用 setProviderKey"
      pattern: "invoke.*set_active_provider"
    - from: "src/components/CmdKPalette.tsx"
      to: "src/stores/uiStore activeAIProvider"
      via: "provider 从 uiStore 读,不再硬编码"
      pattern: "useUIStore.*activeAIProvider"
---

<objective>
Settings UI 加 provider selector + per-provider API key 管理,把 CmdKPalette 和 ChatPanel 的 provider 硬编码切换成读 uiStore.activeAIProvider,跑通 Phase 9 端到端 UAT。

Purpose: Phase 9 收尾 plan,把所有 AI 入口的 provider 配置统一,然后用户手动 UAT 全链路 (Plan 01-05 集成验证)。
Output: SettingsAISection 组件 + 全部入口 provider 解耦 + UAT checkpoint
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/9-ai/9-CONTEXT.md
@.planning/phases/9-ai/9-01-PLAN.md
@.planning/phases/9-ai/9-02-PLAN.md
@.planning/phases/9-ai/9-03-PLAN.md
@.planning/phases/9-ai/9-04-PLAN.md
@.planning/phases/9-ai/9-05-PLAN.md

@src/views/SettingsView.tsx
@src/components/SettingsApiKeySection.tsx
@src/stores/uiStore.ts
@src/lib/api.ts
@src/components/CmdKPalette.tsx
@src/components/ChatPanel.tsx

<interfaces>
<!-- Plan 01 Rust commands (Phase 9 已注册) -->
```typescript
invoke<void>('set_active_provider', { provider: 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'ollama' });
invoke<'deepseek' | ...>('get_active_provider');
invoke<string[]>('list_providers');
invoke<boolean>('has_provider_key', { provider });
invoke<void>('set_provider_key', { provider, key });
```

<!-- uiStore (Plan 04/05 已加) -->
```typescript
isCmdKOpen, setCmdKOpen;
isChatPanelOpen, setChatPanelOpen;
activeAIProvider: Provider;  // Plan 04 已加
setActiveAIProvider: (p) => void;
```

<!-- SettingsView 现有结构 (NAV_ITEMS 数组,SettingsApiKeySection 在 privacy section) -->
```typescript
const NAV_ITEMS = [
  { id: 'account', icon: User, label: '账号信息', group: '个人设置' },
  // ... 'privacy' section 现在调 SettingsApiKeySection
];
// Plan 06:加 'ai' section,调 SettingsAISection
```
</interfaces>

<risks>
- **Ollama 没本地运行:** UAT 时如果用户没装 Ollama,切换到 ollama provider 后 invoke('chat') 会失败。 Ponytail:SettingsAISection 在选 Ollama 时显示提示 "需要本地运行 Ollama (ollama serve)"。
- **Provider 切换后旧 key 失效:** 用户从 DeepSeek 切到 OpenAI,但没输 OpenAI key,会导致 chat 报 'invalid api key'。 Ponytail:切换 provider 时,如果 has_provider_key(newProvider) === false,自动 focus 到 key 输入框 + 显示提示。
</risks>
</context>

<tasks>

<task type="auto">
  <name>Task 1: SettingsAISection 组件 + SettingsView 接入 + 全局 provider 解耦</name>
  <files>src/components/SettingsAISection.tsx, src/views/SettingsView.tsx, src/components/SettingsApiKeySection.tsx, src/lib/api.ts, src/components/CmdKPalette.tsx, src/components/ChatPanel.tsx</files>
  <read_first>
    - src/views/SettingsView.tsx (NAV_ITEMS + activeSection 分发)
    - src/components/SettingsApiKeySection.tsx (现有 single-provider API key UI,Plan 06 替换)
    - src/stores/uiStore.ts (activeAIProvider 字段)
    - src/lib/api.ts (Plan 02 加的 chatWithTools / Provider type)
    - src/components/CmdKPalette.tsx (Plan 04,硬编码 'deepseek')
    - src/components/ChatPanel.tsx (Plan 05,硬编码 'deepseek')
  </read_first>
  <behavior>
    - 新建 SettingsAISection 组件:
      - SegmentedControl 或 Select 选 provider (5 个)
      - 切换时 invoke('set_active_provider') + uiStore.setActiveAIProvider
      - 选定 provider 后,显示该 provider 的 API key 输入 (复用 has_provider_key / set_provider_key)
      - Ollama 选中时显示提示 + 不显示 key 输入 (无 key)
    - SettingsView NAV_ITEMS 加 'ai' 项 (Robot icon,label 'AI 设置',group '个人设置')
    - SettingsView activeSection 'ai' 分发到 SettingsAISection
    - 删除旧 SettingsApiKeySection 的引用 (privacy section 改为 "API key 已迁移到 AI 设置" 占位 + link)
    - CmdKPalette:provider 从 useUIStore((s) => s.activeAIProvider) 读
    - ChatPanel:同上
    - src/lib/api.ts 加 listProviders / setActiveProvider / getActiveProvider / hasProviderKey / setProviderKey 五个 Tauri wrapper 函数 (供 SettingsAISection 用)
  </behavior>
  <action>
1. 编辑 `src/lib/api.ts` 加 provider 管理 wrapper (放 chatWithTools 之后):
   ```typescript
   export async function listProviders(): Promise<Provider[]> {
     if (!isTauri()) return ['gemini'];   // web mode only supports gemini
     const { invoke } = await import('@tauri-apps/api/core');
     return invoke<string[]>('list_providers') as Promise<Provider[]>;
   }

   export async function setActiveProvider(provider: Provider): Promise<void> {
     if (!isTauri()) return;
     const { invoke } = await import('@tauri-apps/api/core');
     await invoke('set_active_provider', { provider });
   }

   export async function getActiveProvider(): Promise<Provider> {
     if (!isTauri()) return 'gemini';
     const { invoke } = await import('@tauri-apps/api/core');
     return invoke<Provider>('get_active_provider');
   }

   export async function hasProviderKey(provider: Provider): Promise<boolean> {
     if (!isTauri()) {
       // web mode: check process.env via /api/chat health endpoint? Ponytail: just return true for gemini
       return provider === 'gemini';
     }
     const { invoke } = await import('@tauri-apps/api/core');
     return invoke<boolean>('has_provider_key', { provider });
   }

   export async function setProviderKey(provider: Provider, key: string): Promise<void> {
     if (!isTauri()) return;
     const { invoke } = await import('@tauri-apps/api/core');
     await invoke('set_provider_key', { provider, key });
   }
   ```

2. 创建 `src/components/SettingsAISection.tsx`:
   ```typescript
   import { useEffect, useState } from 'react';
   import { Robot, Key, Warning, Check } from '@phosphor-icons/react';
   import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
   import { Input } from '@/src/components/ui/Input';
   import { Button } from '@/src/components/ui/Button';
   import { useUIStore } from '@/src/stores/uiStore';
   import { useToast } from '@/src/components/ui/Toast';
   import {
     listProviders, setActiveProvider, hasProviderKey, setProviderKey, Provider,
   } from '@/src/lib/api';

   export function SettingsAISection() {
     const activeProvider = useUIStore((s) => s.activeAIProvider);
     const setActiveInStore = useUIStore((s) => s.setActiveAIProvider);
     const [providers, setProviders] = useState<Provider[]>(['deepseek', 'openai', 'anthropic', 'gemini', 'ollama']);
     const [hasKey, setHasKey] = useState<boolean | null>(null);
     const [keyInput, setKeyInput] = useState('');
     const [isSavingKey, setIsSavingKey] = useState(false);
     const { toast } = useToast();

     // Load providers + has_key on mount + when activeProvider changes
     useEffect(() => {
       listProviders().then(setProviders).catch(() => {});
     }, []);
     useEffect(() => {
       if (activeProvider === 'ollama') { setHasKey(true); return; }
       hasProviderKey(activeProvider).then(setHasKey).catch(() => setHasKey(false));
     }, [activeProvider]);

     const handleProviderChange = async (newProvider: Provider) => {
       try {
         await setActiveProvider(newProvider);
         setActiveInStore(newProvider);
         setKeyInput('');
       } catch (e) {
         toast({ type: 'error', title: '切换 provider 失败', description: (e as Error).message });
       }
     };

     const handleSaveKey = async () => {
       if (!keyInput.trim() || isSavingKey) return;
       setIsSavingKey(true);
       try {
         await setProviderKey(activeProvider, keyInput.trim());
         setHasKey(true);
         setKeyInput('');
         toast({ type: 'success', title: 'API key 已保存', description: '存储于系统钥匙串' });
       } catch (e) {
         toast({ type: 'error', title: '保存失败', description: (e as Error).message });
       } finally {
         setIsSavingKey(false);
       }
     };

     return (
       <div className="space-y-6">
         <div className="flex items-center justify-between mb-2">
           <h2 className="text-xl font-bold text-text-primary">AI 设置</h2>
         </div>

         {/* Provider selector */}
         <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-4">
           <div className="flex items-center gap-2">
             <Robot size={18} weight="duotone" />
             <p className="text-sm font-medium text-text-primary">LLM Provider</p>
           </div>
           <p className="text-xs text-text-tertiary">
             默认 DeepSeek V4 Flash (D-13)。可切换到 OpenAI / Anthropic / Gemini / Ollama (本地)。
           </p>
           <div className="flex flex-wrap gap-2">
             {providers.map((p) => (
               <button
                 key={p}
                 onClick={() => handleProviderChange(p)}
                 className={cn(
                   'px-3 py-1.5 rounded-[var(--radius-md)] text-sm font-medium border transition-colors',
                   activeProvider === p
                     ? 'bg-accent text-white border-accent'
                     : 'bg-bg-secondary text-text-secondary border-border-subtle hover:bg-bg-primary'
                 )}
               >
                 {p}
               </button>
             ))}
           </div>
         </div>

         {/* API key per provider */}
         {activeProvider !== 'ollama' && (
           <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-3">
             <div className="flex items-center justify-between">
               <div>
                 <p className="text-sm font-medium text-text-primary flex items-center gap-1.5">
                   <Key size={14} weight="duotone" />
                   {activeProvider} API Key
                 </p>
                 <p className="text-xs text-text-tertiary mt-0.5">
                   {hasKey ? <span className="text-success flex items-center gap-1"><Check size={10} weight="bold" /> Key is set</span> : 'Stored in OS keychain, never written to app files.'}
                 </p>
               </div>
             </div>
             <Input
               type="password"
               value={keyInput}
               onChange={(e) => setKeyInput(e.target.value)}
               placeholder={`${activeProvider} API key`}
             />
             <Button variant="primary" size="sm" onClick={handleSaveKey} disabled={!keyInput.trim() || isSavingKey}>
               {hasKey ? 'Update key' : 'Save key'}
             </Button>
           </div>
         )}

         {/* Ollama hint */}
         {activeProvider === 'ollama' && (
           <div className="rounded-[var(--radius-lg)] border border-border-subtle p-5 space-y-2">
             <div className="flex items-center gap-2 text-warning">
               <Warning size={16} weight="duotone" />
               <p className="text-sm font-medium">Ollama 需要本地运行</p>
             </div>
             <p className="text-xs text-text-tertiary">
               安装 Ollama (ollama.com),pull llama3.1 模型,然后 <code className="font-mono">ollama serve</code>。
               Nova 会通过 http://localhost:11434 调用,无需 API key。
             </p>
           </div>
         )}
       </div>
     );
   }

   import { cn } from '@/src/lib/utils';
   ```

3. 编辑 `src/views/SettingsView.tsx`:
   - NAV_ITEMS 加 'ai' 项:
     ```typescript
     { id: 'ai', icon: Robot, label: 'AI 设置', group: '个人设置' },
     ```
   - import { Robot } from '@phosphor-icons/react'
   - import { SettingsAISection } from '@/src/components/SettingsAISection'
   - 在 activeSection 分发逻辑加:
     ```tsx
     {activeSection === 'ai' && <SettingsAISection />}
     ```
   - 修改 placeholder 防卫条件:把 'ai' 加到 excluded list (现有 condition `activeSection !== 'account' && activeSection !== 'appearance' && activeSection !== 'privacy'` 加 `&& activeSection !== 'ai'`)
   - privacy section 改为占位提示 (SettingsApiKeySection 暂时保留,但加个 note "DeepSeek-only legacy,推荐用 AI 设置"):
     - Ponytail:直接把 SettingsApiKeySection 替换成占位 "API key 管理已迁移到 [AI 设置]" + button 切到 ai section

4. 编辑 `src/components/CmdKPalette.tsx`:
   - 把 `provider: 'deepseek'` 改成 `provider: useUIStore((s) => s.activeAIProvider)`
   - 在组件顶部加 hook:`const provider = useUIStore((s) => s.activeAIProvider);`

5. 编辑 `src/components/ChatPanel.tsx`:
   - 同上,把硬编码 'deepseek' 改成 `const provider = useUIStore((s) => s.activeAIProvider);`

6. 删除 src/components/SettingsApiKeySection.tsx (Ponytail:deletion over addition,被 SettingsAISection 替代)
   - 如果有其他地方还 import SettingsApiKeySection,先 grep 确保无引用,再删
  </action>
  <verify>
    <automated>cd D:/Projects/Nova/pm-workspace && npm run lint</automated>
  </verify>
  <done>
    SettingsView 加 'AI 设置' 导航,SettingsAISection 暴露 provider selector + per-provider key 管理。CmdKPalette 和 ChatPanel provider 从 uiStore 读。SettingsApiKeySection 删除 (功能被 SettingsAISection 取代)。
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Phase 9 端到端 UAT 验证</name>
  <action>用户手动 UAT:Settings → CmdK → ChatPanel → 错误处理 → 上下文注入 6 步全链路</action>
  <what-built>
    Phase 9 端到端集成:Rust multi-provider chat command (Plan 01) → Express /api/chat fallback + chatWithTools client (Plan 02) → 10 个 tools + Zod registry (Plan 03) → tool loop + CmdKPalette + ⌘K 快捷键 (Plan 04) → ChatPanel slide-out (Plan 05) → Settings provider selector (Plan 06 Task 1)。
  </what-built>
  <how-to-verify>
    **前置准备:**
    1. 在 OS keychain 已有 DeepSeek API key (或 Plan 06 SettingsAISection 输入)
    2. `npm run tauri:dev` 启动桌面 app

    **UAT 步骤:**
    1. **Settings → AI 设置:**
       - 看到 provider selector (5 个按钮:deepseek/openai/anthropic/gemini/ollama)
       - 默认选中 'deepseek',显示 "Key is set" (绿色 check)
       - 切换到 'openai' → 显示 key input (无 key 状态) → 输入任意 key → "Save key" → 看到 "Key is set"
       - 切换到 'ollama' → 显示 "Ollama 需要本地运行" 提示,无 key 输入
       - 切回 'deepseek'

    2. **⌘K 命令模式 (Cmd+K / Ctrl+K):**
       - 全局按 Cmd+K → palette 弹出 (顶部居中,spring 动画)
       - 默认 "命令" 模式 → 列出 10 个 tools (createTask/listTasks/listProducts/...)
       - 搜索 "create" → 过滤到 createTask
       - Enter → prompt 输入 args JSON `{"title":"测试任务"}` → executeTask → toast "createTask executed"
       - 打开任务管理 view → 看到新任务 "测试任务" 出现在看板顶部

    3. **⌘K AI 对话模式:**
       - Cmd+K → 切换到 "AI 对话" 模式
       - 输入 "列出所有产品" → Enter
       - 看到 "执行 listProducts..." 占位 → AI 流式渲染回复 → 显示产品列表
       - 关闭 palette (Esc 或点 overlay)

    4. **ChatPanel 多轮对话:**
       - Sidebar 顶部点 "AI 助手" 按钮 → ChatPanel 从右侧滑出 (480px)
       - 输入 "创建一个高优任务,标题 'AI 测试任务',明天截止" → Enter
       - 看到 tool trace "[createTask ✓]" + AI 回复 "已创建任务"
       - 任务管理 view 验证任务已创建
       - 继续问 "把这个任务标记为已完成" → AI 调用 completeTask → 任务在看板上变完成状态
       - 关闭 ChatPanel (Esc 或 X)

    5. **错误处理验证:**
       - Cmd+K AI 对话模式 → 故意构造模糊指令让 AI 调 tool 时 args 错 (e.g. "随便创建个任务" 不给 title)
       - 看到 AI 第一次尝试 tool 失败 → 1 次自动重试 (Zod issue 反馈给 LLM) → 要么修正成功,要么放弃并解释
       - 把 DeepSeek key 改成无效 → 调 AI → toast "API key 无效,请到 Settings 更新"

    6. **核心上下文注入验证:**
       - 选中某个产品 (ProductManagementView)
       - Cmd+K AI 对话 → 问 "我现在在做什么产品?"
       - AI 应该回答选中的产品名 + stage (证明 buildCoreContext 注入了 selected product)

    **预期结果:** 全部 6 步通过,无 crash,无 unhandled error。
  </how-to-verify>
  <resume-signal>type "approved" 或描述任何 issue (我会修复后重新 UAT)</resume-signal>
</task>

</tasks>

<verification>
- `npm run lint` 通过
- grep 验证: src/components/SettingsAISection.tsx 存在 + 包含 'set_active_provider' 或 'setActiveProvider'
- grep 验证: src/views/SettingsView.tsx NAV_ITEMS 包含 'ai'
- grep 验证: src/components/CmdKPalette.tsx 不再硬编码 'deepseek',读 useUIStore activeAIProvider
- grep 验证: src/components/ChatPanel.tsx 同上
- UAT checkpoint: 用户验证端到端全链路
</verification>

<success_criteria>
1. Settings UI 有 provider selector + per-provider API key (D-14) (AI-05 ✓)
2. CmdKPalette 和 ChatPanel provider 从 uiStore 读,与 Settings 同步 (AI-05 ✓)
3. 5 个 provider 切换可用 (DeepSeek/OpenAI/Anthropic/Gemini/Ollama),Ollama 走 localhost (AI-05 ✓)
4. 端到端 UAT 全部通过:Settings 配置 → CmdK 命令/AI 对话 → ChatPanel 多轮 → tool 执行 → 错误处理 → 上下文注入
5. 错误处理分层生效:ToolArgError 1 次重试 + invalid key toast + 其他错误向用户解释 (AI-09 ✓)
</success_criteria>

<output>
After completion, create `.planning/phases/9-ai/9-06-SUMMARY.md` and `.planning/phases/9-ai/9-VERIFICATION.md`
</output>
