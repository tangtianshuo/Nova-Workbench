# Phase 32: coding 工具地基 - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

agent 在用户真实仓库中先研究后行动——read/grep 自由侦察,write/edit/exec 每步过门(diff 卡 / exec 白名单),改动可审批、可取消、可沉淀。交付:code_ops 5 工具 Rust 原生(read/write/edit/exec/grep,exec 扩展现有 exec.rs)、`code_edit` diff 审批卡(确认队列第四宿主)、exec 白名单四绕过面收口(CP-6)、repo 作用域锁(CP-7)、取消与 TabRunPanel 进度、diff 卡沉淀进第二大脑(CODE-06)。

边界外:hashline(v0.5)、xterm/LSP/DAP、多 diff 批量卡、plan mode、嵌 bash、自动 git commit/push(REQUIREMENTS Out of Scope 锁定)。

</domain>

<decisions>
## Implementation Decisions

### repo 绑定模型(smart discuss 2026-09-04)
- 绑定宿主 = workspace 级:工作区 git 检测出 repo_root 随 workspace 持久化,复用 workspace_id stamping 先例,agent_events 天然可审计
- 工作区内锁定单 repo_root(取首个 git 根),不支持 repo 列表 — CP-7 边界简单,越界即拒
- 绑定时机 = 打开工作区后台 git 检测自动绑定 + 设置页可改,不在工具首次调用时弹卡
- Nova 狗粮:dev 模式一键绑定 Nova 自身仓库作测试 repo,UAT 直接狗粮

### diff 审批卡体验(MP-1 防轰炸)
- 同 turn 多文件变更 = 逐张排队确认(处理一张亮下一张,徽章显示 N 张待审),不并列铺开
- reject 附原因回传 agent:该 edit 不落盘、run 继续可调整重试(MP-1),不中止整个 run
- diff 上下文固定 3 行(unified diff 惯例),不做用户可调设置
- 沉淀入口 = diff 卡「沉淀改动摘要」按钮直接走 knowledge_write 候选流(复用第二段确认,零新管线)

### exec 白名单产品行为
- 出厂极小只读预置(git status/diff/log + ls/dir),其余全靠首遇「允许一次/总是/拒绝」学习
- 「总是允许」作用域 = 工作区级(与 repo 作用域锁对齐,换工作区重新学)
- 白名单存储 = kv_store JSON(既有先例,键 = workspace_id),不建新表
- git 危险 flag 黑名单命中 = 硬拒绝(工具直接 Failed 回原因,不弹卡,不提供「总是允许」出口)

### 进度与取消
- TabRunPanel 进度粒度 = 当前工具名 + 目标文件 chip(exec 显示命令截断),不展示完整参数
- 取消时未决 diff 卡自动 reject + 审计事件(复用 run 取消级联;重跑时 agent 重新提案),不保留 pending
- exec 长任务输出 = 尾部 N 行实时刷新(tail 语义,UI 折叠可展开),不只完成时回传
- CP-8 崩溃孤儿进程清杀 = Windows 主场先做(PID 枚举 + cmdline 匹配 repo_root 前缀);macOS/Linux 记 debt

### Claude's Discretion
- code_ops.rs 内部结构、diff 文本生成(similar UnifiedDiff)、前端 diff 视图组件拆分等实现细节
- Windows npm .cmd/.bat 解析方案(research-phase 深研后定)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- 确认队列 confirmations.rs:kind 字符串开放(kind 列 + params_hash 去重 + 原子消费),`code_edit` 为新增 kind;既有五种 kind 先例(knowledge_write/deliverable_draft/exec_approval/fs_write/pm_write)
- exec.rs 已存在(exec_approval kind 已有先例),CODE-01/CODE-03 扩展它不新建工具
- fs_ops.rs 模式 = code_ops.rs 的结构模板(Rust 工具注册表 + tools::execute)
- TabRunPanel.tsx + tabRunStore 已存在(Phase 26 tab 接引擎),进度展示扩展
- workspace_id stamping(Phase 18)先例 — repo_root 绑定随 workspace 走
- kv_store JSON 先例(白名单存储);knowledge_write 候选流(沉淀复用)
- >4KB 结果 artifact 化先例(exec 输出回传上限)

### Established Patterns
- 双侧 replay parity fixture 同 commit(事件 schema 增量必须双侧);CP-4 流程门:首个 plan 必含事件种类清单 + fixture + CI 互锁断言
- confirmed 重放走 Rust `tools::execute`(fs_write 先例),TS executeTool 不实现 coding 工具
- 研究已锁定依赖:similar 3.2(Rust unified diff)+ ignore/grep-searcher/grep-regex + react-diff-view 3.3.3 + diff 9(懒加载,297KB chunk 教训)

### Integration Points
- src-tauri/src/engine/tools.rs(工具注册表)、exec.rs、fs_ops.rs、confirmations.rs、scheduler.rs(取消级联)
- 前端确认卡宿主(Drawer/工作区/文档工作区 = 现有三宿主,diff 卡 = 第四宿主)
- TabRunPanel(产研中心)/ tabRunStore

</code_context>

<specifics>
## Specific Ideas

- RESEARCH flag:Windows 无 shell 调 npm 只能 .cmd/.bat,exec.rs normalize 只剥 .exe — research-phase 深研(MEDIUM)
- 必避 pitfalls:CP-2(hash 域 = {path, old_string, new_string})、CP-3(apply 前重读重校验)、CP-6(四绕过面)、CP-7(repo 边界)、CP-8(孤儿进程)、MP-1(防轰炸)、MP-10(grep/read 服务端限流+分页)、MP-11
- Success criteria 五条见 ROADMAP(edit 重校验篡改测试 / 同文件两 edit 两 token / env 无 *KEY* 测试 / junction+大小写+Nova 数据路径三测试 / 长任务取消+TabRunPanel+沉淀)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
