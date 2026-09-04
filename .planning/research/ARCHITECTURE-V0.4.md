# Architecture: v0.4 集成方案(coding Agent + spawn_subagent + pipeline + Skill)

**Project:** Nova-PM-Workspace v0.4
**Researched:** 2026-09-04
**Mode:** Ecosystem/Architecture(基于引擎源码实查,非训练数据推测)
**Overall confidence:** HIGH(集成点全部来自源码实查;子 run 调度死锁等设计点为 MEDIUM,已在文中标注)

## 实查结论(先说推翻假设的部分)

1. **`agent_events` 没有 `run_id` 列**(event_log.rs:84-91:INSERT 列为 event_id/session_id/seq/event_type/created_at/...)。ADR-0004 说的「事件 schema 可表达 run_id + parent_run_id」**预留并未落地**——v0.4 需要 migration 0015 或用 session 维度表达(见 §B 推荐)。
2. **调度器没有父子关系**(scheduler.rs:`SchedState { active, queue_interactive, queue_batch }` + `meta: HashMap<run_id, (session_id, title)>`)。cancel 传播目前只靠 `AppState.engine_runs: HashMap<run_id, CancellationToken>`(commands.rs:218)。ADR-0004 说的「调度器 run 注册表含父子关系」也未落地。
3. **「第三态协议」已存在**:PORT-01 idempotency class(`rerunnable`/`verify_first`,tools.rs ToolSpec.idempotency)+ 取消时孤儿 exec 落 `Failed tool_result {ok:false, error:"cancelled"}`(scheduler.rs 测试 519-521 行断言)。coding exec/write/edit 直接继承,不需要新机制。
4. **确认 kind 列表**(confirmations.rs:171 + commands.rs):`knowledge_write` / `memory_write` / `deliverable_draft` / `exec_approval` / `fs_write` / `pm_write` / `destructive_action` / ingestion batch。kind 是自由字符串列,**加新 kind 零 schema 改动**,只需 commands.rs 加 confirmed 分支 + webview 加卡片区。
5. **确认后重放路径已有两种先例**:exec 在 Rust 重执行(engine_exec_confirmed,commands.rs:438);fs_write 在 Rust `tools::execute` 重执行(commands.rs:1330)。coding 工具照抄第二种,TS executeTool 不需要实现 coding 工具。
6. **workflow_templates 表已预留 skill 字段**(workflow_store.rs:25:`skill_trigger`、`skill_tools_json`、`manifest_version`、`source` 列已存在)。Skill 不需要新表起步。

## A. coding 5 工具接入点

### 注册表与风险标注(tools.rs)

| 修改点 | 现状 | v0.4 改动 |
|---|---|---|
| `ToolKind` 枚举(tools.rs:137) | 8 个 kind | 加 `Code`(或 `CodeRead`/`CodeWrite`,如需分流风险) |
| `registry()` 静态表(tools.rs:159) | ToolSpec{name/description/parameters/kind/idempotency} | +5 条:`code_read`/`code_write`/`code_edit`/`code_exec`/`code_grep` |
| `execute()` match(tools.rs:625) | 每工具一个 arm | +5 arm,新建 `src-tauri/src/engine/code_ops.rs`(照 fs_ops.rs 模式:纯函数 + resolve + confirmed 重执行入口) |
| loop_runner ROLE_AND_TOOL_RULES(loop_runner.rs:97) | 列举现有工具 | 按 persona/白名单过滤工具描述(见 B 的 modelHint/persona) |

**风险三档(D-12 coding 侧严格档):**
- `code_read`/`code_grep` → Readonly,免确认(照 fs_list/fs_read)
- `code_write`/`code_edit` → **一律 diff 审批卡**:新确认 kind `code_edit`,params 携带 unified diff(path/old/new hunk);`idempotency: "verify_first"`
- `code_exec` → 复用 exec.rs 全套:白名单(default_whitelist + kv 学习)+ `exec_approval` HITL + `add_command_to_whitelist`。**不新建 exec 工具,扩展现有 exec.rs**:coding 场景白名单追加构建/测试类命令(npm/cargo/test 等,进 coding persona 的默认白名单而非全局 default_whitelist,避免助手侧也放行)。首遇未知命令 HITL 语义已存在(exec.rs:23-02),零改动。

### diff 审批卡 = 确认队列新 kind(不是新机制)

- `code_edit` candidate:params = `{path, diff, old_string_hash}`,summary = 文件路径 + 变更行数(卡片预览用)
- confirmed 重执行:commands.rs 加 `engine_code_edit_confirmed`(照 engine_exec_confirmed 的 prepare/settle 两段式):consume candidate → Rust 重跑 str-replace → `append_tool_result_inner` 配对落事件
- **edit 语义(锁定裁定 D-13)**:old_string 唯一性校验;匹配失败/多处匹配 → tool_result error **回带行号**(实现:对目标串逐行扫描,返回所有匹配行号);绝不模糊重试
- webview:新 diff 卡组件(第四宿主;现有宿主 = 聊天/tab-run/文档确认卡)

### 路径安全与 repo 根绑定

- **路径逃逸防护直接复用 `fs_ops::resolve_deep`**(fs_ops.rs:33:canonicalize + starts_with,.. 段先拒绝)。code_ops.rs 引用同一函数,不重写。
- **cwd 绑定**:现有 `ToolCtx.workspace_root`(webview folderPath → engine_run → ToolCtx)就是绑定机制。coding 场景增量:① 要求 workspace_root 是 git repo(检测 `.git`,非 repo 给 arg_error 提示);② repo 根 = workspace_root,不做子目录协商——YAGNI,用户选哪个文件夹哪个就是边界。

## B. spawn_subagent 引擎改动

### 父子 run 数据结构:平铺 + parent 映射(不嵌套 VecDeque)

调度器**不改核心结构**。增量:

```rust
// AppState 或 scheduler 增量(平铺,非嵌套)
children: HashMap<String /*parent_run_id*/, Vec<String /*child_run_id*/>>
```

理由:scheduler 的价值是 FIFO/快照/tray,嵌套队列会破坏 snapshot() 与 promote() 的简单性;父子关系只服务于 cancel 级联与审计,HashMap 足够。

**cancel 级联的最 lazy 实现:`CancellationToken::child_token()`**(tokio_util 原生)。spawn_subagent 为子 run 建父 token 的 child token 注册进 engine_runs —— 父 cancel 自动级联子,engine_cancel_inner 零改动。这是推荐路径;children 映射仅留审计/UI 展示用(可选,不阻塞)。

### 子 run 的事件表达:**独立 session_id,而非新列**

推荐:**子 run 用独立 session_id**(如 `{parent_session_id}/sub/{run_id}`,照 Phase 26 tab-run「独立 sessionId 隔离」先例),parent_run_id 记在 sessions 表(parent_session_id 列已存在!event_log.rs:176-188 fork 用的就是它)+ 事件 payload。

理由(ladder):
- ChatSession 投影、compaction、check_event_stream、list_events 全部按 session_id 工作——独立 session = **子 run 上下文隔离、独立 compaction、配对不变量全部零改动免费获得**
- 同一 session 加 run_id 列则每个读取路径都要按 run 过滤,改动面大
- 摘要回传:父的 tool_result 只携带 schema 对象(ADR-0004 §3),父 session 永不见子 session 事件——隔离由 session 边界结构保证
- fork 已有 parent_session_id 语义,复用而非新概念

**事件 schema 增量(最小)**:
- `user_message` 事件 payload 加可选 `origin: "user"|"subagent"`(或子 session 的 session_created 带 `parent_run_id`/`spawned_by`)— D-09 发起方标注同一字段解决
- 父侧:spawn_subagent 就是一对普通 tool_call/tool_result(payload = manifest 名 + 摘要对象),**无新事件种类**

### 父 loop await 子 run

spawn_subagent 工具的执行体:建子 session → 走 engine_run 同一生命周期(register/acquire/loop)→ `select! { 子完成通知, cancel }`。子完成通知 = 子 loop 结束时通过 oneshot/通道回传 `EngineRunResult`。

**关键陷阱(MEDIUM,roadmap 必须研究):cap-3 死锁。** 父 run 持 permit await 子 run,子 run 也要 acquire permit——3 个父各 await 一个子即全部阻塞。方案二选一:
1. **推荐:父在 await 期间释放 permit**(spawn_subagent arm 里 drop permit、子完成后重 acquire)。代价:重 acquire 排队尾部,可接受
2. 子 run 免调度直达(深度 1 有界,不会失控)——更简单但绕过 cap 语义

roadmap 阶段计划时定;两方案改动都局部(不动 promote/dequeue)。

### 摘要回传:子 run 末尾一次 LLM 总结 vs 截断 tool_result

**推荐:结构化摘要,不强制 LLM 总结。** 子 run 的最终 turn content(子 loop 本来就要产出最终答复)+ 引擎侧确定性收集(files changed list 从 code_edit tool_result 事件读、artifacts 从 agent_artifacts 读)拼成 `{summary, files_changed[], artifacts[]}`。只在子 run 超长时(最终 content > N)用一次 chat_no_tools 压缩——复用 compaction summarizer 注入点(LoopContext.summarizer)。失败 = tool_result ok:false 带错误,零新机制(ADR-0004 §3)。

### manifest 与 persona(D-01/D-14)

manifest = 数据(name/description/systemPrompt/toolWhitelist/modelHint),存 SQLite(照 workflow_templates 模式,kv 或新表随 Skill 一起定,**三处同形字段名一次定**——999.5 已裁定)。loop_runner 按 manifest 过滤 registry() 输出 + 覆盖 system prompt + 覆盖 provider/model(modelHint)。子 run 内 HITL 卡照挂确认队列(session_id 过滤已有)。

### Parity fixture 清单(流程铁律,双侧 cargo+npm)

1. 子 session 的 `session_created`(带 parent/spawned_by 标注)投影
2. 子 run 正常完成的父侧 `tool_result`(spawn_subagent,summary 对象 payload)
3. 子 run 失败的父侧 `tool_result`(ok:false)
4. 父 cancel 级联:子 session 尾部 interrupted/Cancelled 事件 + 父侧 tool_result
5. `origin: subagent` 的 user_message(若采用 payload 方案)
6. coding 工具各一对 tool_call/tool_result(code_read 成功 / code_edit WAIT candidate / code_edit 失败回行号 / code_exec 白名单直通 / code_exec exec_approval WAIT)
7. diff 卡 confirmed 后的 `[confirmed rerun]` 配对 tool_result

## C. pipeline 编排:复用 Phase 30 模板 + spawn_subagent,不建新机制

- **关系裁定**:Phase 26「单 run 多步」是 tab-run 形态;Phase 30「模板 run 剧本」= 用户手动逐步跑。v0.4 编排 run = **Phase 30 模板(steps 数组)由一个编排 engine_run 自动依次执行**,每步 = spawn_subagent(或单 run 内连续 tool 调用,由 LLM 决定——不强制)。编排本体不引入新数据结构:模板即剧本,ADR-0001「拓扑由 LLM 运行时决定」红线不破。
- **确认门**:每阶段 spawn 前由编排 run 发一个确认 candidate(新 kind `pipeline_gate`,params = {stage, template_id, next_prompt}),复用「run 结束于 WAIT + confirmed 后新 engine_run 续跑」既有路径。默认带门;**「这次全自动」= 会话级跳过开关**(webview 在确认卡上提供,写 kv/会话标记,编排 run 读之)——策略不上升为架构(ADR-0004 §4)。
- **断点续跑**:编排 run 挂在门上时 run 已结束(WAIT),重启恢复 = 既有确认持久化(TTL 24h)+ 续跑时从事件日志读「最后完成的阶段」(检查点 = 上一阶段 spawn_subagent 的 tool_result seq;ADR-0001 事件日志检查点既定路径,无需新 checkpoint 表)。门过期(>24h)则编排终止并告知用户。

## D. Skill:复用 workflow_templates + FTS5,替换注入方式

- **表**:起步**不分表**——workflow_templates 已有 `skill_trigger`/`skill_tools_json`/`manifest_version` 列(30-D-08 预留)。Skill = 同表 `source='skill'` 或加一列 kind,FTS5 索引挂 knowledge 同款 FTS 机制(独立 FTS 虚表,不混 knowledge_docs——检索域不同,但用 fts_tokens.rs 同一套 CJK 切分)。分表触发条件:Skill 出现 workflow_templates 装不下的字段时再迁。
- **注入模式**:替换 `append_workflow_list` 的截断名单(loop_runner.rs:114,代码里已有 `TODO v0.4: FTS5 retrieval (D-08)` 注释)——系统 prompt 只放 name+description+trigger 清单(≤30),触发时用 skill_search(FTS5)取全文注入。同 Claude Code 机制。
- **沉淀入口**:复用 Phase 30 确定性沉淀链(事件日志 → 步骤草稿 → 确认卡 → 落库,零 LLM),把目标从 workflow_create 换成 skill_create(或同一工具加 kind 参数)。
- **FTS5 fixture**:无新事件种类;skill_search 是普通 Readonly 工具,tool_call/tool_result 走通用 fixture。

## 数据流变更汇总

```
现状:webview → engine_run(run_id, session) → scheduler permit → loop_runner
      → tools::execute → AwaitConfirmation → run 结束(WAIT)→ webview confirm
      → engine_*_confirmed(Rust 重执行)→ append_tool_result → 续跑 engine_run

v0.4 增量:
- code_ops.rs 五工具(照 fs_ops 模式,resolve_deep 复用)
- spawn_subagent:工具执行体内建子 run(独立 session_id + child_token)+ await(permit 让位防死锁)
- pipeline_gate kind + 会话级跳过标记(kv)
- workflow_templates 加载路径:prompt 清单 → FTS5 按需全文
- 子 run 摘要:最终 content + 确定性 files_changed/artifacts 收集
```

## 新组件 vs 修改组件

| 类型 | 项 | 落点 |
|---|---|---|
| 新文件 | code_ops.rs | src-tauri/src/engine/(照 fs_ops.rs) |
| 新文件 | subagent.rs(spawn/await/摘要,或并入 loop_runner) | src-tauri/src/engine/ |
| 新表/列 | manifest 存储(persona+subagent+Skill 三形) | migration 0015(如需);workflow_templates 列已在 |
| 修改 | tools.rs | ToolKind/registry/execute +5 工具 + spawn_subagent |
| 修改 | exec.rs | coding persona 白名单扩展(默认集不动) |
| 修改 | loop_runner.rs | prompt 按 manifest 过滤/modelHint;append_workflow_list → FTS5;permit 让位钩子 |
| 修改 | commands.rs | engine_code_edit_confirmed / pipeline_gate confirmed / spawn 续跑 |
| 修改 | confirmations.rs | 仅新 kind 常量(机制零改) |
| 修改 | webview | diff 卡、pipeline 门卡、子 run 投影(session 树/徽章)、Skill 检索 UI |
| 修改 | src/ai/(parity) | fixture ×7(见 B 节清单)+ ChatSession 投影新 payload |

## 建议 Build Order(3-5 phase,coarse)

依赖律:**A 是 B(prototype-builder)与 C 的地基;B 是 C 的地基;D 相对独立可并行。**

1. **Phase A — coding 工具地基**:code_ops 五工具 + `code_edit` diff 卡 + repo 绑定(git 检测)+ exec 白名单 persona 扩展 + parity fixture。*(B/C 的硬前置;也最早产出用户价值)*
2. **Phase B — spawn_subagent 引擎机制**:子 run 生命周期(child_token 级联 + 独立 session + await/permit 让位)+ 摘要回传 + manifest 存储 + prd-writer(不依赖 A,可早验)+ parity fixture。*(A、B 间的并行窗口:B 的引擎机制与 A 无耦合,prd-writer 用现有工具即可端到端)*
3. **Phase C — persona 双入口 + prototype-builder + pipeline 门**:coding persona(modelHint 强模型)+ prototype-builder(白名单 = 5 coding 工具)+ pipeline_gate + 会话级跳过 + 断点续跑。*(依赖 A+B)*
4. **Phase D — Skill**:FTS5 按需加载(替换截断名单)+ skill_search + 沉淀入口扩展。*(与 A/B 并行无冲突,排最后收口或穿插)*

切分边界依据:A/B 是引擎机制(可各自独立验收:diff 卡 UAT、子 run UAT);C 是两者之上的产品形态;D 只碰 prompt 注入与一张表。若压缩到 3 phase:B 并入 C(机制+形态同 phase),保持 A / B+C / D。

## Phase-Specific 研究旗标

| Phase | 需深研点 | 置信 |
|---|---|---|
| B | cap-3 死锁方案(permit 让位 vs 子免调度);子 run 在 tray 的展示形态 | MEDIUM |
| A | Windows 下无 shell 的构建工具调用(npm 是 .cmd,`tokio::process::Command` 直调需处理)——exec.rs normalize 只剥 .exe,`.cmd`/`.bat` 是已知坑 | MEDIUM |
| C | 编排续跑的 UX(门过期后的用户感知);「会话级跳过」的存储粒度 | MEDIUM |
| D | workflow_templates 装 Skill 的字段上限(何时分表) | HIGH(先合后分无返工风险) |

## Sources

- src-tauri/src/engine/:scheduler.rs、loop_runner.rs(1-250)、tools.rs(1-250/598-680)、exec.rs(1-180)、confirmations.rs(1-150)、fs_ops.rs(grep 实查)、event_log.rs(grep)、commands.rs(175-490)、workflow_store.rs(grep)
- docs/adr/ADR-0004-subagent-as-tool.md(全文)
- .planning/phases/999.5-dual-agent-architecture/999.5-CONTEXT.md(D-01..D-14)
- .planning/milestones/v0.3.3-phases/30-workflow-templates/30-CONTEXT.md(D-07/D-08)
- .planning/PROJECT.md
