---
phase: quick-260818-can-ai-ui
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/components/WorkspaceSummaryModal.tsx]
autonomous: true
requirements: [QUICK-260818-CAN]
must_haves:
  truths:
    - "弹窗内容长时不超出弹窗边界,内容区内部滚动"
    - "header/底部操作栏固定可见,不被内容推出视口"
    - "长文件路径/长 snippet 文本换行,不横向溢出"
  artifacts:
    - path: "src/components/WorkspaceSummaryModal.tsx"
      provides: "修复溢出的 AI 工作区总结弹窗"
  key_links:
    - from: "src/components/WorkspaceSummaryModal.tsx"
      to: "src/components/ui/Dialog.tsx DialogContent"
      via: "className 覆盖(p-6 + overflow-hidden + min-h-0)"
      pattern: "max-h-\\[90vh\\].*p-6.*overflow-hidden"
---

<objective>
修复 "AI 智能工作区总结" 弹窗溢出问题。
Output: WorkspaceSummaryModal.tsx 最小 diff。
</objective>

<context>
@src/components/WorkspaceSummaryModal.tsx
@src/components/ui/Dialog.tsx

根因(已核实):
1. `DialogContent` 基类**无 padding**(见 Dialog.tsx L45-52,只有 bg/border/rounded)。而 WorkspaceSummaryModal 的 header/meta/footer 用 `-mx-6 -mt-6 -mb-6` 负 margin,假设父级有 `p-6` — 实际没有,导致这三个区域被推出弹窗边缘(溢出)。
2. 内容区 `flex-1` 无 `min-h-0`:flex 子项默认 `min-height:auto`,长 markdown 撑高而非在 `overflow-y-auto` 内滚动,整体突破 `max-h-[90vh]`。
3. 无 `overflow-hidden`,负 margin 内容连同圆角一起漏出。
</context>

<tasks>

<task type="auto">
  <name>Task 1: 修复 DialogContent 溢出(3 处 class 改动)</name>
  <files>src/components/WorkspaceSummaryModal.tsx</files>
  <action>
仅改 className,不动逻辑:
1. L74 DialogContent: `max-w-3xl flex flex-col max-h-[90vh]` → 加上 ` p-6 overflow-hidden`(给负 margin 提供预期 padding,溢出裁剪保圆角)。
2. L124 内容区: `overflow-y-auto flex-1 space-y-4` → 加 ` min-h-0`(允许 flex 子项收缩,长内容在内部滚动)。
3. L157 markdown 容器 div: 加 ` break-words`(长路径/snippet 换行防横向溢出)。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>弹窗内容任意长度都不超出边界,header/footer 固定,内容区滚动,长文本换行。</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>AI 智能工作区总结弹窗溢出修复</what-built>
  <how-to-verify>
1. `npm run dev` → 文件归档页 → 点击工作区的 "AI 智能工作区总结"
2. 确认:弹窗不超出视口,header/footer 贴边且圆角正常,长文件列表在中间区域滚动
3. 含长路径/长内容 snippet 的文件不横向溢出
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<success_criteria>弹窗在任何内容长度下不溢出,lint 通过。</success_criteria>
