# Phase 1: Dark Mode Wiring - Context

**Gathered:** 2026-08-08
**Status:** Ready for planning
**Mode:** --auto (all gray areas auto-resolved with recommended defaults)

<domain>
## Phase Boundary

把已定义但未连到 UI 的暗色模式 token 系统 + `useTheme()` hook 接入到全应用,包括:
- SettingsView 的"外观主题"section 接入 `useTheme()`
- Header 快速切换入口
- Linux 上 GTK 检测垫片(避开 Tauri#9427)
- 所有 20 个 UI primitives + 11 views + 16 product components 的暗色调色板验证
- 主题切换的平滑颜色过渡

**不在本 phase**:新增 token(已有完整 `.dark` 集合);新增 view(只验证现有);Linux 之外的 dark 模式行为(已工作)。

</domain>

<decisions>
## Implementation Decisions

### Settings Toggle 控件
- **D-01:** 用 `SegmentedControl`(`src/components/ui/SegmentedControl.tsx`)实现 Light / Dark / System 三段式选择,而不是 Radix Select 或 RadioGroup
  - **Why:** 已存在,Apple 风格首选,`layoutId="segmented-indicator"` 的滑动动画与项目 motion 标准一致(参考 CONVENTIONS.md)
  - **Where:** `src/views/SettingsView.tsx` 的"外观主题"section,替换当前的 nav 占位

### Header 快速切换
- **D-02:** Header 右侧加一个 icon button,显示当前 resolved theme(Sun = light / Moon = dark),单击在 light/dark 间 cycle,长按或右键弹菜单含 System 选项
  - **Why:** Header 空间紧凑,单 icon 比三段控件更轻;cycle 行为符合"快速切换"语义;System 通过长按提供避免误触
  - **Where:** `src/components/layout/Header.tsx`(需要在 props 增加 `onToggleTheme` 或直接调用 `useTheme().toggle`)
  - **图标:** Phosphor `Sun` / `Moon`(`weight="duotone"`,size 16,与现有 Header 图标一致)

### Linux GTK 检测垫片
- **D-03:** 在 `useTheme.ts` 内增加平台检测,如果 `navigator.platform` 含 Linux 或 Tauri 检测到 Linux OS,启动 GTK 主题检测:
  1. Primary: 通过 Tauri command 读 `gsettings get org.gnome.desktop.interface color-scheme`(返回 `'prefer-dark'` / `'default'` / `'prefer-light'`)
  2. Fallback: 读 `GTK_THEME` 环境变量(含 `-dark` 后缀判定)
  3. 兜底: 退回 `prefers-color-scheme`(已知不可靠,作为 last resort)
- **D-04:** Manual override(用户在 Settings 选 light/dark)始终优先于检测结果,不被 GTK 监听覆盖
  - **Why:** 用户预期显式选择压倒环境检测(常见 dark-mode bug)
- **D-05:** Linux 上启动期 + 每 2 秒 polling(或 dconf notify,如果可行)检查 gsettings 变化
  - **Why:** `prefers-color-scheme` listener 在 Linux Tauri 上不可靠,polling 是兜底;2 秒足够响应,不浪费 CPU
  - **Ponytail 标记:** `# ponytail: 2s polling on Linux; dconf notify is better but harder to wire — switch if perf or battery bites`

### 颜色过渡动画
- **D-06:** 在 `tokens.css` 顶层为 `html` / `body` 加 transition:`background-color 200ms cubic-bezier(0.4, 0, 0.2, 1), color 200ms cubic-bezier(0.4, 0, 0.2, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)`
  - **Why:** 200ms 匹配 `--duration-normal` token;cubic-bezier 是 motion/react 弹簧外的标准 ease
- **D-07:** 不在切换瞬间做整页 fade(避免内容闪烁感),只让颜色自然过渡
  - **Why:** Apple HIG dark mode 切换是颜色过渡,不是 fade-out + fade-in
- **D-08:** 用户可在 Settings 关闭动画(`prefers-reduced-motion` 检测 + 显式开关)—— 但本 phase 只实现 `prefers-reduced-motion` 检测,显式开关延后
  - **Why:** 无障碍基线,但显式开关是 polish,不是 v1 必须

### 暗色调色板审计范围
- **D-09:** 必须手动验证的组件清单(每个都用 dev 模式截图对比):
  - **20 个 UI primitives:** Card(5 variant)、Button(4 variant)、Badge(6 variant)、Dialog、Input、Textarea、Select、Tabs、Switch、Checkbox、Tooltip、Popover、Toast、Avatar、DropdownMenu、ProgressBar、SegmentedControl、Separator、Skeleton、ScrollArea
  - **11 个 views:** AgentWorkspace、TaskManagement、ProductManagement、RndCenter、Schedule、FileArchive、KnowledgeBase、Settings、Placeholder、ProjectOverview、SmartAnalysis
  - **16 个 product 子组件:** 所有 ProductManagement / RndCenter tabs + modals
- **D-10:** Card `dark` variant(当前用 `from-slate-950 via-indigo-950/90` 字面量)在暗色下需要重新评估—— 它本身已是 dark,可能需要切换到 accent 偏色而不是更深
  - **Why:** CONVENTIONS.md 已标记"special-case hero panels only";DARK-05 要求"无对比度问题"
- **D-11:** 审计发现的问题分类:
  - **P0 阻断:** 文字不可读 / 边框不可见 / 全黑全白
  - **P1 必修:** 对比度 < WCAG AA
  - **P2 可延后:** 微小色差 / hero panel 重设计
  - 本 phase 必须修完所有 P0 + P1;P2 进 backlog

### Claude's Discretion
- SettingsView 中"外观主题"section 的具体排版(标题/描述/控件间距)— 沿用 SettingsView 现有 section 风格
- Linux 平台检测的具体实现细节(Tauri command vs Node child_process)— 看哪个更易在当前架构落地
- polling 的具体实现(setInterval vs requestIdleCallback)— 选简单的
- 审计发现的 P0/P1 bug 的具体修法 — 看代码情况决定是改 token 还是改组件

### Folded Todos
无 — `gsd-tools todo match-phase 1` 返回 0 matches。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目内文件
- `src/hooks/useTheme.ts` — 已实现的三态主题 hook,本 phase 在此基础上扩展 Linux 检测
- `src/styles/tokens.css` (116-156 行) — `.dark` token 完整定义,审计时的真相源
- `src/index.css` — Tailwind v4 `@theme` 桥接 + `glass` / `drag-region` 自定义工具
- `src/components/ui/SegmentedControl.tsx` — SettingsView 三段选择控件
- `src/components/ui/Card.tsx` — 5 个 variant 的实现,审计时重点验证 `glass` / `dark` variant
- `src/components/layout/Header.tsx` — 快速切换入口位置
- `src/views/SettingsView.tsx` — "外观主题" section 的当前占位
- `.planning/codebase/CONVENTIONS.md` — 命名/样式/动画约定(spring physics 标准值、Phosphor 图标用法)
- `.planning/research/PITFALLS.md` §1 — Linux prefers-color-scheme 坏掉的 GitHub issue 链接 + 垫片思路
- `.planning/research/FEATURES.md` §Dark mode — table stakes 清单
- `.planning/PROJECT.md` — Validated 项 ✓ 暗色模式 token 已定义 / Active 项 A. 暗色模式上线
- `.planning/REQUIREMENTS.md` — DARK-01 ~ DARK-07 详细需求

### 外部权威
- Apple Human Interface Guidelines — Dark Mode(https://developer.apple.com/design/human-interface-guidelines/dark-mode)— 切换体验参考
- NN/g — Dark Mode: How Users Think About It(https://www.nngroup.com/articles/dark-mode-users-issues/)— 用户预期
- Tauri#9427(https://github.com/tauri-apps/tauri/issues/9427)— Linux 主题检测 bug 真相
- wry#884(https://github.com/tauri-apps/wry/issues/884)— 上游 WebKit GTK 问题
- WebKit bug #196685 — `prefers-color-scheme` GTK port 未实现

### 不引用
- `docs/ARCHITECTURE.md` / `docs/PIPELINE_DESIGN.md` — 这是 Phase 4 GraphFlow 范围,与暗色模式无关
- ADR-002(虚构)— 不引用

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`useTheme()` hook** (`src/hooks/useTheme.ts`) — 完整的 light/dark/system 三态管理,localStorage 持久化,`prefers-color-scheme` listener。本 phase 只需扩展 Linux 分支 + 接入 UI。
- **`SegmentedControl`** (`src/components/ui/SegmentedControl.tsx`) — 三段式选择控件,带 `layoutId` 滑动动画。直接用于 SettingsView。
- **Phosphor `Sun` / `Moon` 图标** — 已在 `src/lib/icons.ts` 可用,Header 切换按钮用。
- **`tokens.css` `.dark` 块** — 完整的暗色 token 集合(116-156 行),不需要新建。
- **Radix `Switch`** — 如果 Header 改用 Switch 也现成可用,但 D-02 决定用 icon button。
- **`motion/react`** — `whileTap={{ scale: 0.97 }}` 标准 tap 反馈。

### Established Patterns
- **样式:** 必须用 semantic token classes(`bg-bg-primary` / `text-text-primary`),禁止字面色。例外:Card `dark` variant 用字面 gradient(CONVENTIONS.md 已标注)。
- **Hook 用法:** `useState` + `useEffect` + `useCallback` 模式(见 `useTheme.ts`),返回对象 destructure。
- **动画:** `stiffness: 400, damping: 30` 是 hover 标准;`stiffness: 500, damping: 25` 是 checkbox/indicator pop-in 标准(CONVENTIONS.md §Animation)。
- **图标:** `weight="duotone"` 默认,size 14/16/20 标准。
- **JSX 多行:** 3+ props 时换行。
- **SettingsView 结构:** 每个 section 用 `<Card>` 包裹,有标题 + 描述 + 控件(见现有 settings section 模式)。

### Integration Points
- **`src/views/SettingsView.tsx`** — 在"外观主题"nav item 下接入 SegmentedControl。当前文件有 nav 但没内容。
- **`src/components/layout/Header.tsx`** — 在标题/操作按钮区域加 icon button。可能需要接收 `onToggleTheme` prop 或直接调用 hook(后者更简洁,Header 已有自主逻辑)。
- **`src/hooks/useTheme.ts`** — 扩展 Linux 检测分支,不改 API。
- **`src/styles/tokens.css`** — 在 `:root` 顶层加 transition 规则(全应用颜色平滑切换)。
- **`src-tauri/src/lib.rs`**(可能) — 如果 Linux gsettings 检测走 Tauri command,需要加一个 `get_gnome_color_scheme` 命令;否则纯 JS 实现。
  - **倾向:** 先尝试 JS-only(`child_process.execSync('gsettings ...')` via Tauri shell plugin 已注册),如不可行再加 Rust command。

</code_context>

<specifics>
## Specific Ideas

- **Header 快速切换的 cycle 语义:** light → dark → light(单 cycle,不进 System,避免误触进 System 后看起来无变化)。System 选项只在 Settings 显式选择。
- **"Apple-style" 切换:** 颜色过渡平滑(200ms),无 fade,无 layout shift。Apple HIG 是参考。
- **Card `dark` variant 是 hero panel 专用** — 不应该因为它叫 "dark" 就在暗色下被忽略;相反,它在暗色下需要保持视觉权重(可能改成 accent 渐变)。

</specifics>

<deferred>
## Deferred Ideas

- **主题动画显式开关(用户主动关闭)** — 本 phase 只做 `prefers-reduced-motion` 检测;Settings 加显式 toggle 是 polish,延后。
- **Header 快速切换的右键菜单(System 选项)** — 如果实现成本高,本 phase 只做 cycle,菜单延后。
- **主题跟随时间段自动切换(白天 light / 夜晚 dark)** — 新功能,不在本 phase。
- **多 theme preset(不止 light/dark,如 Solarized、Dracula)** — 需要 token 系统重构,完全是另一个 phase。
- **Per-view 主题覆盖(某个 view 强制 dark)** — 当前无需求,YAGNI。

### Reviewed Todos
无 — `todo match-phase` 返回 0 matches,无 reviewed-but-deferred。

</deferred>

---

*Phase: 01-dark-mode-wiring*
*Context gathered: 2026-08-08 (--auto mode, all gray areas auto-resolved with recommended defaults)*
