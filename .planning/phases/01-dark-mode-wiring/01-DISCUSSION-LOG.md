# Phase 1: Dark Mode Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-08
**Phase:** 01-dark-mode-wiring
**Mode:** --auto (recommended defaults auto-selected, no interactive AskUserQuestion)
**Areas discussed:** Toggle UX, Header quick-toggle, Linux GTK shim, Color transitions, Audit scope

---

## Toggle UX (Settings 控件选择)

| Option | Description | Selected |
|--------|-------------|----------|
| SegmentedControl(三段式) | 复用 `src/components/ui/SegmentedControl.tsx`,Apple 风格 layoutId 滑动 | ✓ |
| Radix Select(下拉) | 占空间小,但点击两次才能切换 | |
| RadioGroup | 平铺三个 radio,样式较弱 | |
| 两个 Switch(light/dark + system toggle) | 语义混乱 | |

**Auto-choice:** SegmentedControl — 已存在、Apple 风格首选、CONVENTIONS.md 已记录 layoutId 标准。
**Captured as:** D-01

---

## Header Quick-Toggle

| Option | Description | Selected |
|--------|-------------|----------|
| 单 icon button(Sun/Moon cycle) | 显示当前 resolved theme 图标,单击 cycle,长按弹菜单 | ✓ |
| 双 icon button(Light/Dark 显式) | 占空间大一倍 | |
| Header 内嵌 SegmentedControl | 占空间太大,与 Header 紧凑设计冲突 | |
| 只在 Settings 切换(无 quick-toggle) | DARK-02 明确要求 Header 快速切换 | |

**Auto-choice:** 单 icon button cycle — 空间最省,符合"快速切换"语义,Sun/Moon 图标已有。
**Captured as:** D-02
**Notes:** cycle 不进入 System 模式(避免误触后无视觉反馈);System 仅在 Settings 显式选。

---

## Linux GTK 检测垫片

| Option | Description | Selected |
|--------|-------------|----------|
| gsettings primary + GTK_THEME env fallback + prefers-color-scheme 兜底 | 三层降级,GNOME/KDE 都覆盖 | ✓ |
| 只用 prefers-color-scheme | 已知 Tauri#9427 坏掉,不可行 | |
| 只读 GTK_THEME env | GNOME 默认不设此变量,覆盖不全 | |
| 通过 Tauri Rust command 读 dconf | 实现成本高,需要新 command | |

**Auto-choice:** gsettings primary + env fallback + prefers-color-scheme 兜底 — PITFALLS.md 推荐方案,三层降级保覆盖度。
**Captured as:** D-03 + D-04 + D-05
**Notes:** manual override 始终优先;2 秒 polling(dconf notify 更好但更难接);Ponytail 标记后续可优化。

---

## 颜色过渡动画

| Option | Description | Selected |
|--------|-------------|----------|
| 200ms cubic-bezier 在 bg/color/border | 匹配 `--duration-normal` token,平滑不拖沓 | ✓ |
| 整页 fade-out + fade-in | Apple HIG 不是这么做的,有内容闪烁感 | |
| 无过渡(瞬切) | DARK-07 明确要求平滑过渡 | |
| 400ms 长过渡 | 太慢,影响切换节奏感 | |

**Auto-choice:** 200ms cubic-bezier — 匹配项目 motion 标准,符合 Apple-style 切换。
**Captured as:** D-06 + D-07
**Notes:** `prefers-reduced-motion` 检测做;显式 toggle 延后(D-08)。

---

## 暗色调色板审计范围

| Option | Description | Selected |
|--------|-------------|----------|
| 全量:20 UI primitives + 11 views + 16 product components,每个 dev 模式截图对比 | DARK-05/06 要求"无 token 缺失" | ✓ |
| 抽样:只审计 Card/Button/Badge + 高频 view | 风险高,容易漏 DARK-06 的边角组件 | |
| 自动化对比测试 | 超出本 phase 范围,需要 Storybook/Percy 等基础设施 | |

**Auto-choice:** 全量手动审计 — DARK-05 + DARK-06 明确要求"无对比度问题 / 无 token 缺失"。
**Captured as:** D-09 + D-10 + D-11
**Notes:** P0+P1 必修,P2 进 backlog。

---

## Claude's Discretion

- SettingsView section 排版细节(标题/描述/控件间距)
- Linux 检测的具体实现(Tauri command vs Node child_process vs 其他)
- polling 实现方式(setInterval vs requestIdleCallback)
- 审计发现的 P0/P1 bug 的具体修法

## Deferred Ideas

- 主题动画显式开关(本 phase 只做 prefers-reduced-motion 检测)
- Header 快速切换的右键菜单(System 选项)— cycle 模式优先
- 时间段自动切换(白天 light / 夜晚 dark)
- 多 theme preset(Solarized / Dracula)
- Per-view 主题覆盖
