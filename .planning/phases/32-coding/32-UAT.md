---
status: diagnosed
phase: 32-coding
source: [32-01-SUMMARY.md, 32-02-SUMMARY.md, 32-03-SUMMARY.md, 32-04-SUMMARY.md, 32-05-SUMMARY.md]
started: 2026-09-07T09:45:00+08:00
updated: 2026-09-07T10:25:00+08:00
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing paused — 6 items outstanding, fixing Gap test#3 first per user request]

## Tests

### 1. Cold Start Smoke Test
expected: 完全退出 Nova 后 `npm run tauri:dev` 从零启动:无 schema_version 拒绝启动错误,窗口正常打开,会话/任务/知识库数据正常加载
result: pass

### 2. Repo 绑定 + Header badge
expected: 设置页「工作区与仓库」区绑定一个真实 git 仓库(DEV 环境可用「绑定 Nova 仓库(狗粮)」一键)。Header 显示「Repo: {basename}」accent 徽章,悬停见全路径;设置页 repo_root 回显;留空重绑可清除
result: pass

### 3. ENGINE-01 侦察 run(零确认)
expected: 绑定仓库后发起 coding run,如「读一下 package.json,告诉我用了哪些主要依赖」。code_read/code_grep 侦察零确认直接返回结果;TabRunPanel 显示工具进度行(图标 + mono 目标 chip);agent 未绑定时无「先研究后行动」契约,绑定后遵循先侦察后修改
result: issue
reported: "有个奇怪的地方需要进行修复,工作区和仓库应该是默认在同一个路径下,切换了产品后,产品的工作区以及代码仓库都需要相应切换。代码生成应当也在工作区目录下进行生成,除非用户进行了指定。"
severity: major

### 4. code_edit diff 审批卡 + 应用
expected: 让 agent 修改一个文件(如「在 README.md 末尾加一行注释」)。AI 台弹出 diff 审批卡(unified diff 渲染、mono 路径、「代码修改」徽章);TabRunPanel 改动文件 chip 出现「待审」warning 状态点;点「应用改动」后文件实际被改写,chip 翻「已应用」success
result: [pending]

### 5. 拒绝附原因 + agent 重试
expected: 另一次 code_edit 卡点「拒绝」展开 inline 原因输入,填原因(如「改用英文注释」)提交。文件不落盘;agent 收到原因后调整并重试;chip 翻「已拒绝」danger
result: [pending]

### 6. exec 三选卡 + 尾部输出
expected: 让 agent 跑首遇命令(如 `npm --version`)。exec 卡三按钮:允许一次(primary)/总是允许(secondary,tooltip 记住此命令仅当前工作区)/拒绝(danger),命令+首参数学习粒度 chip 高亮;允许后 TabRunPanel「输出(尾部 N 行)」mono 区实时显示;「总是允许」后同命令再跑不再弹卡
result: [pending]

### 7. 篡改场景(CP-3 stale 重校验)
expected: diff 卡 pending 期间手动编辑目标文件(如用编辑器改一行),再点「应用改动」。卡片报 stale 错误:file changed since the edit was proposed ... now at line {N};文件不被错误覆盖,agent 可 re-read 重试
result: [pending]

### 8. 取消级联 auto-reject
expected: coding run 有 pending diff 卡时取消 run。卡片消失、队列清空;TabRunPanel pending chip 全部翻「已拒绝」;会话出现 transient 消息「run 已取消,改动未应用(路径)」
result: [pending]

### 9. 崩溃恢复孤儿 exec 清杀(Windows)
expected: coding run 执行长命令(如 ping)期间强杀 Nova 进程再重启。重启后孤儿进程被 taskkill 清杀,nova.db 落 orphan_exec_killed 审计事件(pid/command/action)
result: [pending]

### 10. 沉淀改动摘要入第二大脑
expected: 应用一次改动后,diff 卡「沉淀改动摘要」按钮点击。toast「已存入第二大脑候选,待确认」;知识库出现「改动摘要:{basename}」候选卡,走既有确认链可确认入库
result: [pending]

## Summary

total: 10
passed: 2
issues: 1
pending: 7
skipped: 0
blocked: 0

## Gaps

- truth: "workspace 与 repo 默认同路径;切换产品时工作区与代码仓库绑定随产品切换;agent 代码产出默认落工作区目录,除非用户显式指定"
  status: failed
  reason: "User reported: 工作区和仓库应该是默认在同一个路径下,切换了产品后,产品的工作区以及代码仓库都需要相应切换。代码生成应当也在工作区目录下进行生成,除非用户进行了指定。"
  severity: major
  test: 3
  root_cause: "三个独立缺口叠加:(1) Product 与 workspace 数据模型零关联——activeWorkspaceId 是应用级全局,Product 无 workspaceId 字段,engine_run 直接取 activeWorkspaceId(chatConsoleStore.ts:766),切产品不影响它,workspace_repo_roots 绑定随之不联动;(2) 解析优先级相反——resolve_code_target 强制 repo_root(repo_root_or_fail,未绑定即 NO_REPO 失败),workspace_root 完全不参与 code_* 兜底,无 per-call 用户指定机制;(3) 同路径无保障——detect_repo_root 从 workspace 向上找 .git,workspace 是 repo 子目录时静默解析到祖先 repo"
  artifacts:
    - path: "src/data/mockProducts.ts"
      issue: "Product 接口无 workspaceId——product↔workspace 关联在数据模型层不存在"
    - path: "src/stores/uiStore.ts + src/stores/workspaceStore.ts"
      issue: "selectedProductId 与 activeWorkspaceId 两个全局单值互不联动"
    - path: "src/stores/chatConsoleStore.ts"
      issue: "engine_run 入口取 activeWorkspaceId(tabRunStore.ts:228、CmdKPalette.tsx:79 同模式)"
    - path: "src-tauri/src/engine/code_ops.rs"
      issue: "resolve_code_target 无 workspace 兜底、无用户指定 root 通道"
  missing:
    - "Product↔workspace 关联字段 + 产品切换联动 activeWorkspaceId(engine_run 三入口自然继承,workspace_repo_roots 按 workspace_id 键绑定天然随切)"
    - "resolve_code_target 改 user_specified_root > repo_root > workspace_root 兜底;裁定 code_read/grep 是否仍强制 repo 绑定"
    - "detect 向上找 .git 静默逃逸的提示或限制(repo_root ≠ workspace 路径时 UI 可见)"
  debug_session: .planning/debug/workspace-repo-product-binding.md
