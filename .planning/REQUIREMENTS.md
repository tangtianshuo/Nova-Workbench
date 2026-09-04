# Requirements: Nova-PM-Workspace v0.4

**Defined:** 2026-09-04
**Milestone:** v0.4 紧凑产研版 — coding Agent + 子 Agent + Pipeline + Skill
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)
**Research Base:** `.planning/research/SUMMARY-V0.4.md`(STACK/FEATURES/ARCHITECTURE/PITFALLS,2026-09-04)

---

## Engine — Research-Action 循环

- [ ] **ENGINE-01**: agent 循环对标 pi-agent-core 的 Research-Action 语义 — coding agent 以「研究 → 行动 → 观察 → 迭代」循环工作直至任务完成,而非一次性生成
  - 研究类工具(read/grep/glob)零确认、不限次自由调用
  - 行动类工具(write/edit/exec)一律走门(diff 卡 / exec 白名单)— 与 pi 的 read|write|exec 分级同构,D-12 一致
  - coding persona system prompt 显式编码「先研究后行动」契约(侦察 → 定位 → 修改 → 验证)
  - 结构层零新增(loop_runner/ADR-0003 已是该循环的 Rust 实现;本条约束行为语义与权限分界)

## A. Coding Agent(5 工具 + diff 审批 + exec 白名单)

- [ ] **CODE-01**: coding 5 工具(read/write/edit/exec/grep)Rust 原生落 code_ops,exec 扩展现有 exec.rs 不新建
  - edit = str-replace:old_string 唯一性校验 + 失败回带行号(D-13);错误消息语义对照 pi-edit 惯例(错误文案即模型接口)
  - apply 前重读文件重校验(stale-anchor 等价,CP-3 必有)
- [ ] **CODE-02**: write/edit 每文件一张 diff 审批卡(确认队列新 kind `code_edit`,hash 域 = {path, old_string, new_string},CP-2)
  - diff 视图:增删行高亮 + 上下文行(react-diff-view + diff,懒加载);confirmed 重放走 Rust `tools::execute` 先例
- [ ] **CODE-03**: exec 白名单 — 已知命令直接跑,首遇未知弹「允许一次 / 总是允许 / 拒绝」;「总是」写入白名单(用户自组织)
  - 四绕过面收口(CP-6):学习粒度=命令+首参数二元组、env 过滤(不泄 *KEY*)、PATH 解析、git 危险 flag 黑名单
  - exec 结果结构化回传(stdout/stderr/exit code 分开)
- [x] **CODE-04**: repo 作用域锁 — 打开本地 repo 目录绑定 repo_root(git 检测);write/edit/exec 锁 repo 内,read/grep 放宽到工作区
  - repo_root ≠ workspace_root 显式边界,工具不得读写 Nova 自身数据(CP-7);TOCTOU 再 resolve + Windows 大小写 canonicalize
- [ ] **CODE-05**: 取消与进度可见 — 长任务可停(复用 run 取消级联 + exec 子进程 kill);TabRunPanel 显示当前工具、正在改哪个文件;崩溃后孤儿 exec 进程恢复清杀(CP-8)
- [ ] **CODE-06**: diff 卡落槽知识库 — 改动摘要可一键沉淀进第二大脑(复用 knowledge_write 候选流)

## B. spawn_subagent(双入口 Persona + 专家子 run)

- [ ] **SUB-01**: spawn_subagent 工具 — manifest 专家 + 子 run 隔离 + 结构化摘要回传(ADR-0004)
  - 子 run = 独立 session(`{parent}/sub/{run_id}`,sessions.parent_session_id 列已存在);cancel 级联 child_token;深度 1 不递归
  - 摘要回传 = 引擎确定性收集 manifest `{summary, files_changed[], artifacts[]}`,不信子 LLM 自述
  - 父 run await 子 run 不占公共调度 permit(CP-1 死锁回归测试);子事件永不进父流,父侧只落一对 spawn tool_call/tool_result(CP-5)
- [ ] **SUB-02**: 双入口 persona — 聊天助手 / coding(tab-run)两 manifest 同引擎,manifest modelHint 选模型(D-01/02/14);persona 徽章 + 共享会话列表(D-03)
- [ ] **SUB-03**: 首批 2 专家 — prd-writer(零新工具依赖,可先行验证 spawn 链路)/ prototype-builder(白名单 = 5 coding 工具)
- [ ] **SUB-04**: spawn 对用户透明 — 投影层渲染「专家卡」(谁、干什么、结果摘要);子 run HITL 卡挂现有确认队列并带 parent 徽章

## C. Pipeline 编排 Run + 可配置确认门

- [ ] **PIPE-01**: 编排 run — 顺序 spawn 阶段子 run(ADR-0004 §4),阶段产物落 agent_artifacts,断点续走事件日志检查点;阶段进度视图(TabRunPanel 阶段维度)
- [ ] **PIPE-02**: 默认带门 — 每阶段产物候选 → HITL → 落槽(Phase 16/26/30 既有语义复用);无门自动编排 = 哲学违反
- [ ] **PIPE-03**: 会话级「跳过后续确认」开关 — run 结束失效,不做全局配置;开关不可旁路 exec/diff 硬门(MP-7 写进 ADR)
- [ ] **PIPE-04**: 门粒度三档 — 逐产物(默认)/ 阶段摘要 / 跳过;策略落在模板与确认 kind 标注,不上升为架构
- [ ] **PIPE-05**: 工作流模板一键转 pipeline — 同一模板两种跑法(用户点跑单 run 多步 = 模板;跨专家多 run 编排 = pipeline),渐进升级

## D. Skill 系统(模板超集,一张数据多入口)

- [ ] **SKILL-01**: skill = workflow_templates 超集字段(manifest + prompt 模板 + 工具白名单 + 触发描述 + 产出卡槽)— 一张数据两个入口,绝不两套 DSL;退路 = skills 表外键引用模板
- [ ] **SKILL-02**: 内置系统级 skill — 只读层 JSON(include_str! 双语言单源,Phase 30 先例),开箱即用,跨工作区
- [ ] **SKILL-03**: 两级作用域 — 系统级(跨工作区)∪ 工作区级(仅当前);检索与注入联合过滤
- [ ] **SKILL-04**: FTS5 按需检索加载 — 系统 prompt 只注入 name+description 清单(≤30),skill_search 全文检索(复用 CJK 混合管线)
- [ ] **SKILL-05**: 用户创建 + 从对话/run 沉淀 skill — 确定性沉淀链(事件日志提取 → 草稿 → 确认卡 → 落库,零 LLM);工具白名单从事件实际 tool_call 种类提取;沉淀必过 HITL
- [ ] **SKILL-06**: agent 自主检索加载 — 对话中「按我的竞品分析流程来」→ skill_search 命中 → agent 按剧本执行(可微调非刚性);skill_injected 审计事件
- [ ] **SKILL-07**: skill 使用审计 + 产出卡槽声明 — 哪次 run 用了哪个 skill 版本可追责;deliverable slot 让 skill 产物自动落卡槽不蒸发
- [ ] **SKILL-08**: 产研编排统一载体 — skill 阶段剧本支撑 pipeline 编排定义;一张数据三形态(用户点跑 = 模板 / agent 检索 = skill / pipeline 阶段 = 剧本)

---

## Out of Scope(v0.4 不做)

| Feature | Reason |
|---------|--------|
| hashline 编辑协议 | D-13 锁定 v0.5;str-replace 够用 |
| xterm.js / 交互式 PTY 终端 | IDE 特征,与 run-based 有界模型相克 |
| LSP / DAP(补全/调试/跳转) | Nova 不是编辑器;用户回自己 IDE 改码 |
| 多 diff 批量审批卡 | 批量 = 审批形同虚设;每文件一卡 |
| Plan mode(先批 plan 再执行) | 对 PM 场景偏重,第三套门;v0.5 池 |
| bash 嵌套 / pipeline 组合命令 | D-13 锁定;组合命令绕白名单 |
| 自动 git commit/push | 危险越权;git 走 exec 白名单首遇询问 |
| DAG / 条件分支 / 循环工作流引擎 | GraphFlow 正式否决;刚性 pipeline 禁令 |
| 模板强制流程(跳步报错) | 哲学红线;模板 = 参考剧本 |
| 全局「全自动」配置项 | 会话级开关足够;全局免确认 = 安全债 |
| pipeline 定时/事件自动触发 | 首版纯用户发起;触发器语义另行裁定 |
| Router agent / 固定角色编排 | ADR-0004 否决;主 agent 即入口 |
| 10 角色系统 / persona 热切换 / 递归 spawn | D-14 / ADR-0004 锁定 |
| ask tool(结构化追问卡) | D-14:候选形态,实施再定 |
| Skill marketplace / 导入导出 | 单机 PM 工具;v0.5+ 再议 |
| 自动触发 skill / 嵌入式向量检索 | 自主性 ≠ 持续开销;FTS5 中文已验证 |
| omp crates vendoring | 研究终裁:零 crate(pi-edit/pi-natives/pi-diff 逐项否决,见 SUMMARY-V0.4) |
| /research 只读模式、快慢模型双段式 | ENGINE-01 讨论中未确认;需要再议 |
| MCP / IM 入口 / OCR | v0.5+ 池 |
| 携带债务(27 UAT 回归 / REV-01/02 / cap-5 / params_hash) | 用户裁定 v0.4 纯新功能,债务后推 |

## Notes

- **流程门(全 phase):** 每个 phase 首个 plan 必含事件 schema 增量文档 + 双侧 parity fixture 同 commit + CI 互锁断言(CP-4,对应 RETROSPECTIVE 两次 VERIFICATION 缺失教训)
- **Build order(研究建议):** coding 地基 → subagent 机制(与 A 有并行窗口)→ persona+prototype-builder+pipeline 门 → Skill(独立可穿插);phase 编号续 32
- **Research flags:** cap-3 死锁方案二选一(P2 前)、Windows npm .cmd 解析(P1 前)、门过期 UX(P3 前)、workflow_templates 字段上限(P4)需 /gsd:research-phase 深研
