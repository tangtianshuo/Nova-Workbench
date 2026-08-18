---
phase: quick-260818-task-stats
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/components/StatsRow.tsx]
autonomous: true
requirements: [QUICK-260818-01]
must_haves:
  truths:
    - "四张统计卡显示 taskStore 真实派生数字(今日待办/进行中/已完成/逾期)"
    - "完成/新增/删除任务后数字即时更新"
    - "不可解析 deadline 的任务不会导致页面崩溃"
  artifacts:
    - path: "src/components/StatsRow.tsx"
      provides: "基于 useTaskStore 派生的统计卡"
      contains: "useTaskStore"
  key_links:
    - from: "src/components/StatsRow.tsx"
      to: "src/stores/taskStore.ts"
      via: "useTaskStore((s) => s.categories)"
      pattern: "useTaskStore"
---

<objective>
把 StatsRow 的硬编码 mock 统计(12/28/56/3 + 假 trend)替换为 taskStore 真实派生数据。

Output: src/components/StatsRow.tsx — 四卡布局/视觉不变,数字来自 useMemo 派生。
</objective>

<context>
@src/components/StatsRow.tsx
@src/stores/taskStore.ts
@src/data/mockTasks.ts

现状事实:
- StatsRow.tsx 模块级 `const stats = [...]` 硬编码,无 props,含 trend/isPositive(假数据)
- taskStore: `categories: TaskCategory[]`,每 cat 含 `tasks: Task[]`;Task.status 为中文字符串('未开始' | '进行中' | '已完成'),deadline 为 'YYYY-MM-DD HH:mm' 或自由文本
- TaskManagementView.tsx:20 `<StatsRow />` 无 props — 保持无 props,组件内部自取 store
- 无既有 deadline 安全解析纯函数(reportSelectors.ts 不存在)— 在组件内写本地 helper
</context>

<tasks>

<task type="auto">
  <name>Task 1: StatsRow 改为 taskStore 派生统计</name>
  <files>src/components/StatsRow.tsx</files>
  <action>
    重写 src/components/StatsRow.tsx:
    - `const categories = useTaskStore((s) => s.categories)`,在 `useMemo` 中 `categories.flatMap(c => c.tasks)` 派生四项计数:
      - 今日待办: `t.status !== '已完成'` 且 deadline 日期部分 === 今天本地日期
      - 进行中: `t.status === '进行中'`
      - 已完成: `t.status === '已完成'`
      - 逾期: `t.status !== '已完成'` 且 deadline 日期 < 今天
    - 本地安全解析 helper(模块级纯函数): 取 `t.deadline.slice(0, 10)`,用 `/^(\d{4})-(\d{2})-(\d{2})$/` 校验后 `new Date(y, m-1, d)` 取本地零点;不匹配或 Invalid Date 返回 null → 不计入今日/逾期(注释说明:不可解析 deadline 永不计入,不 throw)。今天用 `new Date()` 本地零点比较。
    - **删除 trend 行**(整个 trend/isPositive/TrendIcon/"较昨日"),替换为真实副信息一行 `text-xs text-text-tertiary`:
      - 今日待办 → `共 X 项未完成`(X = 全部未完成数)
      - 进行中 → `占未完成 Y%`(未完成为 0 时显示 `暂无未完成`)
      - 已完成 → `共 X 项任务`
      - 逾期 → `占未完成 Y%`(同上守卫)
      百分比四舍五入 `Math.round`,除零守卫。
    - 保持:四卡 grid 布局、CardHover、icon、badgeVariant、入场动画、subLabel("项任务")全部不变;value 为 `String(count)`。
    - 删除不再使用的 ArrowUpRight/ArrowDownRight import。
  </action>
  <verify>
    <automated>npm run lint</automated>
  </verify>
  <done>StatsRow 无硬编码数字与 trend;计数全部来自 useTaskStore useMemo;类型检查通过;四卡视觉结构不变</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>任务管理页统计卡真实数据化</what-built>
  <how-to-verify>
    1. `npm run dev` 打开 http://localhost:3000 → 任务管理页
    2. 四卡数字与看板实际任务一致(今日待办按今天日期核对)
    3. 勾选完成一个任务 → "已完成"+1,"进行中/未完成"相应减少
    4. 无 trend 假百分比行,副信息显示占比/总数
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>npm run lint 通过;手动核对统计数字随任务操作实时变化</verification>
<success_criteria>四卡数字由 taskStore 派生,无 mock 残留,无 throw 风险</success_criteria>
<output>完成后创建 .planning/quick/260818-gec-task-stats-real-data/260818-gec-SUMMARY.md</output>
