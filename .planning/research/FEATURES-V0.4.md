# Feature Landscape: v0.4 — Coding Agent + Subagent + Pipeline + Skill

**Project:** Nova-PM-Workspace
**Researched:** 2026-09-04
**Mode:** Ecosystem(形态研究,非技术选型 — 选型见 STACK/前置调研)
**Sources:** 业界形态参考 = Claude Code / Cline / Cursor / oh-my-pi(训练数据,MEDIUM 置信;UX 模式多年稳定)+ 项目内裁定(999.5 D-01..14、ADR-0004、Phase 30 D-01..09,HIGH 置信)

**定位裁剪原则(贯穿全文):** Nova 是 PM 桌面工作台,不是 IDE。coding 是 pipeline 一环(PRD→原型代码)+ 狗粮自我开发,不是主力开发环境。所有「IDE 克隆」特征默认 anti-feature。产品哲学红线:严禁刚性 pipeline;模板/skill 是参考,用户自组织。

---

## A. Coding Agent(5 工具 + diff 审批 + exec 白名单)

### Table Stakes(缺了用户会觉得"这不是能干活的 agent")

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 5 工具:read/write/edit/exec/grep | Cline/Claude Code 全有;缺任一即"残废 agent" | 大(Rust 原生) | edit = str-replace + old_string 唯一性校验 + 失败回带行号(D-13 锁定);exec 不嵌 bash(锁定) |
| write/edit 一律 diff 审批卡 | 写磁盘必须可见、可拒绝;Cline 每文件一卡是事实标准 | 中 | 复用既有确认队列机制,只加 diff 渲染(kind=coding_write);Nova 已有三档风险档案,coding 侧维持严格档(D-12) |
| diff 视图:增删行高亮 + 上下文 | 纯文本 diff 不可读;最少 +/- 行着色 + 前后几行上下文 | 中 | Milkdown/prismjs 已在依赖内;首版不需要 side-by-side |
| exec 白名单:已知命令直接跑,未知首遇询问 | Cline 形态:白名单(git status/ls 等)auto-approve,首遇未知命令弹确认卡「允许一次/总是允许/拒绝」 | 中 | 「总是允许」写入白名单 = 用户自组织,符合哲学 |
| repo 打开(选本地目录)+ 沙箱边界 | agent 写任意路径不可接受;工具作用域锁在打开的 repo root 内 | 中 | 工作区已有目录扫描/FileTree(v0.3.1 quick),复用;read/grep 可放宽到工作区,write/edit/exec 锁 repo |
| 取消 | 长任务必须能停;已有 run 取消语义(调度器级联) | 小 | 复用;exec 子进程 kill 沿 v0.3.0 已测路径 |
| 进度可见 | 用户盯着 agent 干活:当前工具、正在改哪个文件 | 小 | TabRunPanel 已是通用 run 面板,coding run 同构接入 |

### Differentiators(PM 定位下值得做的)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 原型场景预设:打开的 repo + PRD 上下文自动注入 | PM 用户不懂 prompt 工程;从产研中心 PRD 卡槽一键「生成原型」,deliverable 上下文 + repo 一起进 run | 中 | PRD→代码是 Nova 独有管线;IDE 工具没有 PM 数据源 |
| 狗粮场景:Nova 自我开发工作区 | 自举验证 + 真实使用;repo 打开即用,无额外机制 | 小 | 只是 coding agent 的一个实例,零额外代码 |
| diff 卡上直接落槽知识库 | 改动摘要可沉淀(「记录这次改动」)— 第二大脑闭环 | 小 | 复用 knowledge_write 候选流 |
| exec 结果结构化回传(stdout/stderr/exit code 分开) | agent 需要判断失败原因;也喂后续 pipeline 阶段 | 小 | ADR-0004 schema-validated 回传的同款要求 |

### Anti-Features(显式不做)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| hashline 编辑协议 | D-13 锁定 v0.5;str-replace 够用 | old_string 唯一性校验 + 失败带行号 |
| 终端仿真器(xterm.js 交互式 PTY) | IDE 特征;PM 不需要在 Nova 里开 shell;交互式 PTY 与 run-based 有界模型相克 | exec 一次性命令 + 结构化输出 |
| LSP/DAP(补全/调试/跳转) | 已锁超范围;Nova 不是编辑器 | 用户改代码回自己的编辑器/IDE;Nova 管 diff 审批与产物 |
| 多 diff 批量审批(攒 N 文件一张卡) | 批量 = 用户看不懂就全批,审批形同虚设;PM 用户更需要逐张慢批 | 每文件一卡;想快用会话级跳过开关(见 C) |
| Plan mode(先出 plan 批准再执行) | 好形态但对 PM 场景偏重;Nova 已有候选→确认的产物级审批,plan 审批是第三套门 | 首版不做;需求出现再议(v0.5 池) |
| bash 嵌套/pipeline 组合命令 | D-13 锁定;组合命令绕白名单语义 | 单命令白名单 |
| 自动 git commit/push | 危险 + 越权;Cline 也默认询问 | git 命令走 exec 白名单,首遇询问 |

---

## B. 双入口 Persona + spawn_subagent

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 双入口:聊天助手 / coding(tab-run) | D-01/D-02 锁定;两 persona manifest,同一引擎 | 中 | 助手 = 快模型,coding = 强模型(modelHint,D-14);不做 router |
| persona 徽章 + 共享会话列表 | D-03 锁定;不拆两个列表 | 小 | |
| spawn_subagent:manifest 专家 + 子 run 隔离 + 摘要回传 | ADR-0004 锁定语义;CrewAI 式编排已否决 | 大 | 首批 prd-writer / prototype-builder;深度 1 不递归;取消级联;schema-validated 回传 |
| 子 run HITL 卡挂现有确认队列 | ADR-0004 §3;父工具挂起等人 | 中 | 两阶段 confirm 复用,不加新机制 |
| 子 run 进度可见(父会话里看到"正在跑 prd-writer") | 用户不能面对黑盒等几分钟 | 小 | TabRunPanel 嵌套展示或事件流内联标记 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| spawn 入口对用户透明:用户看到的是「让专家写了 PRD」而非 agent 术语 | PM 不懂 subagent;投影层把 spawn_subagent 渲染为一张"专家卡"(谁、干什么、结果摘要) | 小 | 纯 webview 投影,引擎不动 |
| 助手可 spawn coding 子代理(D-01) | 「帮我把这个 PRD 做成原型」一句话跨 persona | 中 | D-01 已定;依赖 A 块完成 |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Router agent / 固定角色编排 | ADR-0004 否决(两次蒸馏有损、与 ADR-0001 相克) | 主 agent 即入口 |
| 10 角色系统(omp 式) | D-14 否决;单作者维护面不可承受 | 首批 2 专家,加专家 = 加 manifest |
| 会话内 persona 热切换(mid-run 换模型/人格) | 增加心智模型;入口即 persona 足够 | 新开 session 选 persona |
| 子 agent 递归 spawn | ADR-0004 锁定深度 1 | 需要更深再议 |
| ask tool(结构化追问卡) | D-14:候选形态,去留随实施再定 | 首版用普通文本回复 + 确认卡覆盖;不新增卡类型 |

---

## C. Pipeline 编排 Run + 可配置确认门

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 编排 = 依次 spawn 阶段子 run(ADR-0004 §4) | 已锁定;断点续跑走事件日志检查点 | 中 | 依赖 B;阶段产物落 agent_artifacts |
| 默认带门:每阶段产物走候选→HITL→落槽 | 既有语义(Phase 16/26/30);无门的自动编排 = 哲学违反 + 用户不信任 | 小(复用) | |
| 会话级「跳过后续确认」开关 | ADR-0004 锁定;「这次全自动」不做配置系统 | 小 | 开关要在 UI 明显可见 + 可随时关;开了以后 exec/delete 仍建议保留硬门 |
| 阶段进度视图:多阶段 run 的阶段列表 + 当前位置 | 用户需要知道跑到哪、卡在哪个门 | 中 | TabRunPanel 扩展阶段维度 |
| 断点续跑(门处暂停,确认后继续) | 长编排不能一崩全弃;事件日志检查点已备 | 中 | v0.3.0 可恢复底座复用 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 从工作流模板一键发起 pipeline(Phase 30 衔接) | 模板 = 剧本(用户主动跑单 run 多步),pipeline = 编排 run(跨专家多 run);同一模板两种跑法,渐进升级 | 中 | 关键设计点:见 D 块关系界定 |
| 门粒度三档:每阶段产物(默认)/ 每阶段结束摘要 / 会话级跳过 | PM 场景:PRD 我要逐字看,原型代码看摘要就行;一档一刀切必有一端是地狱 | 中 | 策略表非架构(ADR-0004:「策略不上升为架构」);落在模板/确认 kind 标注 |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| DAG/条件分支/循环工作流引擎 | GraphFlow 已正式否决(PROJECT Out of Scope);刚性 pipeline 禁令 | 顺序阶段 + LLM 运行时决定拓扑(ADR-0001) |
| 模板强制流程(跳步 = 报错) | 哲学红线直译违反 | 模板 = 参考剧本,agent 可微调步骤,用户可改/弃(30-D-05 先例) |
| 全局默认「全自动」配置项/偏好设置页 | ADR-0004:「这次全自动」不做配置系统;全局免确认 = 安全债 | 会话级开关,run 结束失效 |
| pipeline 定时/事件自动触发 | 触发器是助手侧能力(D-08 本地零-LLM 检查先行),pipeline 首版纯用户发起 | 触发器语义已有裁定,不并入 |
| 每产物 N 张卡 × 阶段 M 无上限堆积 | 确认地狱(「帮我安排今天」不能变确认地狱) | 门粒度三档让用户选密度;阶段摘要门兜底 |

---

## D. Skill 系统

**与 Phase 30 工作流模板的关系界定(质量门要求,先定调):**

- **模板 = 剧本**(步骤序列,用户主动跑;Phase 30 已交付,单 run 多步逐步 HITL)
- **Skill = manifest + prompt 模板 + 工具白名单 + 产出卡槽**(agent 可检索加载的能力单元;ADR-0004 manifest 第三次复用)
- **不做两套东西的办法:skill 是模板的超集扩展,不是平行系统。** 模板加 skill 字段(30-D-08 已预留兼容);一个带 skill 字段的模板既是「用户可手动跑的剧本」又是「agent 可 FTS5 检索加载的能力」。skill 加载 = agent 读 manifest + prompt → 本质是模板 run 由 agent 发起而非用户点击。一张数据,两个入口。若实施中发现强行同形扭曲,退路 = skills 表引用 workflow_templates(id 外键),绝不复制两份 prompt。

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Skill manifest(name/description/systemPrompt/toolWhitelist/触发描述/产出卡槽) | ADR-0004 同形裁定;三处同形字段名统一一次定(999.5 discretion) | 中 | |
| FTS5 按需检索加载:系统 prompt 只放 name+description,匹配到再取全文 | 30-D-08 锁定;全量注入撑爆上下文;knowledge FTS5 管线现成 | 中 | skill_search 工具,复用 CJK 混合检索 |
| 从对话/run 沉淀 skill:「把这次沉淀成 skill」 | 30-D-07 模板沉淀链确定性先例(事件日志→步骤→草稿→确认卡→落库);skill 同链 + 工具白名单提取 | 中 | 提取 white-list 用事件里实际 tool_call 种类,确定性零 LLM |
| 用户点用:skill 库里手动跑(= 模板入口,零新代码) | 已交付 | 零 | 即 Phase 30 工作流视图 |
| 确认卡消费(沉淀必过 HITL) | agent 生成的 skill 不能静默入库 | 小 | 复用确认队列 |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Agent 自主检索加载(对话中说「按我的竞品分析流程来」→ skill_search 命中 → agent 按剧本执行) | 第二大脑从「我知道」升级到「我会做」;Nova 独有的 PM 工作流记忆 | 中 | 与 30-D-05 同语义:agent 可微调,非刚性;skill 描述注入需 context_injected 式审计 |
| Skill 产出卡槽声明(deliverable slot) | PRD-writer skill 产出的 PRD 自动进研发中心卡槽而非聊天里蒸发 | 小 | generate_deliverable 18 codes 管线现成 |
| Skill 使用审计(哪次 run 用了哪个 skill 版本) | 可追责(事件日志哲学);版本化已有 | 小 | |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Skill marketplace / 导入导出分享 | 单机 PM 工具,无社区规模;v0.5+ 再议 | 本地 SQLite 用户层(30-D-01 两层结构复用) |
| 自动触发 skill(无人参与 agent 自动跑) | 与 D-08 ②档起步裁定相克;自主性 ≠ 持续 API 开销 | 用户对话中提及或点击触发 |
| 独立 skill DSL / 与模板两套格式 | 质量门直译;30-D-08 已预留同形 | manifest 超集,见上文关系界定 |
| 嵌入式向量检索做 skill 匹配 | P2 池锁定;FTS5 中文已验证 | FTS5 混合检索 |
| Skill 强制完整执行(步骤不可跳) | 哲学红线;模板=参考 | agent 微调 + 用户改/弃 |

---

## Feature Dependencies

```
A. coding 5 工具 + diff 卡 + exec 白名单
   └─→ B. spawn_subagent(prototype-builder 依赖 coding 工具;prd-writer 只依赖既有工具,可先行)
   └─→ C. pipeline(阶段 spawn 依赖 B;确认门复用既有队列,不依赖 A/B 也可做门粒度)
B. persona manifest(字段 schema)
   └─→ D. skill manifest(三处同形:persona / subagent / skill — schema 一次定)
Phase 30 模板(JSON + workflow_templates + 沉淀链)
   └─→ D. skill(skill = 模板超集扩展;沉淀链复用)
知识库 FTS5(Phase 15)
   └─→ D. skill_search 检索加载
确认队列 + 候选去重(Phase 14/16)
   └─→ A diff 卡 / B 子 run HITL / C 门 / D 沉淀卡(全部复用,只加 kind)
```

## MVP Recommendation(优先级)

1. **A 全量**(coding 5 工具 + diff 审批 + exec 白名单 + repo 打开)— 里程碑核心价值,其他三块的地基
2. **B 最小**:双 persona manifest(含 modelHint)+ prd-writer(零新工具依赖,验证 spawn 链路)+ prototype-builder(依赖 A)
3. **C 最小**:编排 run(顺序 spawn)+ 默认门 + 会话级跳过开关;门粒度三档可后置到收口
4. **D 衔接版**:skill = 模板超集字段 + FTS5 检索加载 + 沉淀入口;自主触发与审计增强后置

**Defer:** ask tool 去留、plan mode、多 diff 批量卡、触发器自动化、hashline(v0.5)、MCP(v0.5+)。

## Sources

- 项目内裁定(HIGH):999.5-CONTEXT D-01..D-14;ADR-0004;Phase 30 CONTEXT D-01..D-09;PROJECT.md 红线与 Key Decisions
- 业界形态(MEDIUM,训练数据,UX 模式稳定):Cline 逐文件 diff 审批 + 命令白名单「允许一次/总是」;Claude Code 权限询问与 subagent-as-tool;Cursor composer 多文件应用;oh-my-pi task subagents 摘要回传(999.5 已实证引用)
