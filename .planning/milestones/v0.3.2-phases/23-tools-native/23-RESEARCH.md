# Phase 23: 工具层(原生工具集,无桥) - Research

**Researched:** 2026-08-24
**Domain:** Rust 工具注册表扩展(exec/fs/deliverable)+ HITL 白名单学习 + carry-in 写接缝迁移
**Confidence:** HIGH(codebase evidence with file:line;外部 crate 建议为 MEDIUM,见 Sources)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **无桥**:TS 工具桥整体取消;PM CRUD 工具缺席,v0.3.3 关系化后 Rust 原生回归;系统提示含降级说明
- **exec 白名单**:内置只读安全命令默认放行(约 10 条,精确清单 researcher/planner 定);白名单外一律 HITL;确认时可选「仅本次允许」或「永久加入白名单」(持久化 kv_store);不建设置页 UI
- **fs 边界**:路径以 workspace 为根,复用 file_ops.rs 先例;workspace 内读自由/写 HITL;越界直接 error(不给 HITL)
- **deliverable**:生成 = Rust 原生(复刻 generateDeliverable prompt 语义,候选走 HITL);落槽 = webview 用户确认动作,TS 写 rndStore 卡槽(合法过渡),agent_events 落库走 Rust command;无头可生成不可落槽
- **无头 = 有头工具集一致**;exec/fs 不依赖 webview 存活
- **指南块**:适配版(现有原生工具 + CRUD 缺席降级说明),原 PM 指南文本 v0.3.3 恢复
- **PORT-01**:新工具 idempotency 填真值 + PORT_01_SUFFIX(tools.rs:23 已字节锁定)
- **carry-in 两接缝必须迁移**:deliverable_committed → engine command;consumeIntoMemories → engine command
- **exec 确认后重执行**:走 engine_append_tool_result 既有接缝(fresh tool_call_id + `[confirmed rerun]` 已测试锁定,commands.rs:377-390)

### Claude's Discretion
- 白名单精确命令清单、kv key 结构
- exec 进程管理实现(Windows Job Object vs taskkill /T 等)
- 工具注册表扩展方式(ToolSpec enum vs trait 对象)
- deliverable prompt 复刻细节与候选 payload 形状

### Deferred Ideas (OUT OF SCOPE)
- 白名单设置页编辑 UI(v0.3.3)
- PM CRUD Rust 原生工具(v0.3.3)
- 原 Phase 10 PM 工具指南文本恢复(v0.3.3)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOOL-01 | Rust 工具注册表落地,exec/fs/knowledge/deliverable 四类工具可被引擎调用 | tools.rs registry() 静态扩展(§3);loop_runner.rs:304 分发点零改动 |
| TOOL-02 | exec 具备进程组清理/超时/取消/流式回传,白名单外 HITL | tokio full 已在 Cargo.toml:38;白名单 + exec_approval 候选流(§1、§2) |
| TOOL-03 | PM CRUD 缺席 + 降级说明,无桥 | loop_runner.rs:89 ROLE_AND_TOOL_RULES 替换点(§6) |
| TOOL-04 | 无头 = 有头工具集一致,不依赖 webview | 全部工具走 tools::execute 同步/异步路径,无 invoke 反向调用(§1.5 异步执行设计) |
| (carry-in) | 两个 TS 写接缝消灭 | engine_commit_deliverable / engine_consume_memory 设计(§4、§5) |
</phase_requirements>

## Summary

Phase 23 的全部扩展点都已在 Phase 22 铺好:工具注册表(tools.rs registry/ToolKind/ToolOutcome)、HITL 候选流(confirmations.rs 原子 UPDATE)、确认后重执行(engine_append_tool_result)、Channel 协议(channel.rs 七变体)、run 注册表(state.rs engine_runs)。新工作主要是三类:(1) exec 子进程管理 —— tokio 1.x `full` feature 已是直接依赖(Cargo.toml:38),`tokio::process` + Windows `taskkill /PID /T /F` 是最小可行方案,Job Object 不需要;(2) ToolOutcome 需新增异步执行路径 —— 现有 `tools::execute` 是同步 `&Connection` 函数,exec/LLM 生成必须异步,这是 loop_runner 分发点的唯一结构性改动;(3) 两个 carry-in command,均是对既有 confirmations/event_log 函数的薄封装。

**Primary recommendation:** 保持 ToolSpec 静态注册表 + 在 `tools::execute` 引入 async 变体(`execute_async`,同步工具走原路);exec 用 `tokio::process::Command::kill_on_drop(true)` + timeout + `taskkill /T` 树杀;白名单落 kv_store key `agent.exec.whitelist`(JSON array);carry-in 两个 command 直接复用 confirmations::consume 与 event_log::append。

## Findings by Research Question

### 1. exec 进程管理(核心)

**依赖现状(HIGH):** `tokio = { version = "1", features = ["full"] }` 已在 Cargo.toml:38 — **零新增依赖**,`tokio::process` 由 `full` 覆盖。`tokio-util`(CancellationToken)也已就位(Cargo.toml:42)。tauri v2 自带 tokio runtime(`tauri::async_runtime`),但 engine_run 已自建 current-thread runtime 于 blocking thread(commands.rs:163-167),子进程 spawn 应在该 runtime 内,无需改动。

**进程组清理 — Windows 取舍(MEDIUM,训练数据 + 语义推理;omp 借鉴为 ROADMAP 指定):**
- **推荐:`tokio::process::Command` + `kill_on_drop(true)` + Windows 树杀 `taskkill /PID <pid> /T /F`**。
- Windows 无 POSIX 进程组。等价物两条路:
  - **Job Object**(CreateJobObject + AssignProcessToJobObject + JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE):最可靠,子进程的子进程也被收割,但需 `windows`/`winapi` crate + ~100 行 unsafe FFI。
  - **taskkill /T**:一行,杀进程树;竞态窗口(孙进程刚 spawn)理论上存在,对 PM 工具场景(git/ls/cat/npm)足够。
- **ponytail 裁定:taskkill /T 先行,留 `// ponytail: taskkill /T 有竞态窗口,Job Object 当出现真实漏杀` 注释。** 这与 CONTEXT「Claude's Discretion: researcher 定」一致。非 Windows 用 `kill_on_drop` + `child.kill()`(tokio 覆盖,无树杀 — POSIX 下可选用 `process_group` 但非必需)。
- file_ops.rs:48-71 已有 `std::process::Command` + `CommandExt::raw_arg` 的 Windows 先例可参照(但 exec 工具应统一用 tokio 版)。

**超时 + 取消传播(HIGH):**
- 22-06 run 注册表:`state.engine_runs: Mutex<HashMap<String, CancellationToken>>`(state.rs:20),`engine_cancel` 触发 token.cancel()(commands.rs:223-228)。CancellationToken 已传入 `run_tool_loop`(loop_runner.rs:166),loop 内在 LLM 调用前后检查(loop_runner.rs:249,261)。
- 传播到子进程:exec 工具执行时 `tokio::select! { r = child.wait_with_output-ish => …, _ = cancel.cancelled() => { kill_tree(pid); return Cancelled } , _ = tokio::time::sleep(TIMEOUT) => { kill_tree(pid); return Timeout } }`。超时建议 120s 常量起步(工具 schema 可选 timeoutMs 参数,max 600_000)。
- 取消后必须返回 `ToolOutcome::Failed { message: "cancelled", arg_error: false }` — 不能让 loop 继续迭代;或直接 propagate LoopError::Cancelled(检查 cancel.is_cancelled() 在下一迭代自然命中 loop_runner.rs:249,选后者更省事:Failed + loop 自己在下轮 LLM 前检查取消)。

**流式回传(HIGH):**
- EngineEvent 是七变体 enum(channel.rs:29-44,`serde(tag="kind", content="data")`)。**扩展点:新增变体 `#[serde(rename = "tool_output")] ToolOutput { name: String, stream: String, is_stderr: bool }`** — webview 按 kind switch,新 kind 前端不认识也只是忽略,无破坏。
- 备选(更省):复用 `Token { text }` — 但会混入正文流。**推荐新变体**,webview ChatPanel 按 tool_start/tool_output 上下文归到工具卡。
- stdout/stderr 流式:`child.stdout.take()` → `BufReader::lines` → 逐 chunk 发 `EngineEvent::ToolOutput`。注意 loop 的 EventCallback 是 `Arc<dyn Fn(EngineEvent)>`(loop_runner.rs:29)同步回调 — 在异步 exec 任务里发事件没问题(回调内部是 channel.send,commands.rs:169-171)。
- 截断保护:输出 >4KB 走既有 `event_log::prepare_tool_result` artifact 化(loop_runner.rs:340)— exec 工具结果自然继承,零改动。

**shell 解析(推荐:无 shell 直 exec,HIGH):**
- 工具 schema 用 `command: string` + `args: string[]`(argv 数组),**不引入 shell**,也就不需要 shlex。与 TS registry 的 zod→JSON schema 形状对齐(registry.ts:50-61)。
- 白名单匹配键 = `command`(argv[0] 的 basename,如 `git`),args 不参与白名单判断(只读命令如 `git status` 安全;但 `git` 本身含写子命令 — 见 §2 清单裁定)。备选:若模型常给单字符串,可在 description 里明确要求 args 数组;不要在 Rust 里做 shell 拆参(引号/转义地雷)。

**异步执行的结构性改动(HIGH,本 phase 最大改动点):**
- 现状:`tools::execute(conn, name, args, ctx)` 同步、拿 `&Connection`(tools.rs:156)。loop 在 blocking thread 的 current-thread runtime 里 `rt.block_on(run_tool_loop(...))`(commands.rs:191),内部无 await 工具路径。
- 方案 A(推荐):**新增 `pub async fn execute_async(conn: &Connection, name, args, ctx, cancel, on_event) -> ToolOutcome`**,同步工具内部直接调 `execute`(exec/deliverable_generate 是仅有的异步成员)。loop_runner.rs:304 的 match 改为 `execute_async(...).await`。同步工具签名不变,118 个既有 cargo 测试不受扰。
- 方案 B:全 trait 对象化 — 否决:一个 match 分发够了,CONTEXT「Claude's Discretion」里 enum vs trait,选最短 diff。
- 注意:`&Connection` 不能跨 `child.wait().await` 的借用问题不存在(conn 只在落库时用,子进程等待不持锁),但 exec 结果落 tool_result 时 conn 可用即可。

### 2. 白名单 + HITL 学习

**kv_store schema(HIGH):** `kv_store (key TEXT PRIMARY KEY, value TEXT NOT NULL)` 已有(migrations/0001_init.sql:4-7),与 agent DB 同库(lib.rs:98 `sqlite:nova.db`)— **白名单直接落 kv,零 migration**。
- 推荐 key:`agent.exec.whitelist`,value = JSON array of command strings,如 `["git","ls","dir","cat","type",...]`。启动时读一次缓存 + 「永久加入」时 UPSERT(`INSERT INTO kv_store(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)。Rust 侧读 kv 无先例但就是一行 SELECT。
- 学习写入点:「永久加入」确认动作 = webview 调一个新 command(或 engine_confirm_candidate 带扩展参数)。推荐:**确认卡的「永久加入」= webview 先 `engine_whitelist_add(command)` 再 `engine_confirm_candidate(token)`**,候选消费路径不变。

**HITL 候选流(HIGH):** 走既有 `confirmations::create_candidate(conn, kind, params, summary, session_id)`(confirmations.rs:163),kind 建议 `exec_approval`(新 kind,无 schema 约束 — kind 是自由 TEXT,migration 0006 已为先例:为 deliverable_draft 加过 kind)。params = `{"command": "npm", "args": [...], "cwd": "..."}`。dedup:exec_approval 加入 destructive_action 式 params_hash 去重(confirmations.rs:170-185 需加一行 kind 匹配)。
- 差异点:exec 确认后的**重执行不在 Rust loop 内**(loop 已 WAIT 结束),而是 webview 确认后:①白名单命中或仅本次允许 → **谁执行子进程?** 关键裁定:确认后执行必须仍是 Rust(无头一致性)。推荐:**新 command `engine_exec_confirmed(session_id, token, args…) -> Value`**:原子 consume(confirmations::consume, expected_params=Some)→ tokio spawn 子进程 → 结果走 `append_tool_result_inner`(commands.rs:284,自动 mint `[confirmed rerun]` tool_call)。这与 engine_append_tool_result 同构,前端只多一次 invoke。
- 永久加入白名单的写入发生在 consume 成功后、同 command 内。

**白名单精确清单建议(Windows 11 真实可用;MEDIUM — planner 可调):**
`git`, `ls`, `dir`, `cat`, `type`, `head`, `tail`, `grep`, `find`, `rg`, `where`, `wc`, `node --version` 类不可表达(args 不匹配)→ 清单只按 command:
- **推荐 10 条(command 级):** `git`, `dir`, `ls`, `type`, `cat`, `rg`, `grep`, `findstr`, `where`, `pwd`
- **已知风险:** `git` 含 `git push/clean/reset` 写语义。两个选项:(a) 白名单存「command + 只读子命令前缀」二元组(`["git",["status","diff","log","show","branch"]]`),value 结构 `[{ "command": "git", "subcommands": ["status","diff","log","show"] }]`;(b) command 级全放。**推荐 (a)** — 数据结构仍是一行 JSON,匹配逻辑 ~15 行,堵住 git 写子命令。类似约束 `npm`(只允许 `npm test`/`npm run`?)→ v0.3.2 先不放 npm,交给 HITL。

### 3. fs 工具

**现有资产(HIGH):**
- `file_ops.rs` 先例:`sanitize_file_name`(file_ops.rs:8-16,拒绝 `..` 与 `\/:*?"<>|`)、`resolve_in_root`(file_ops.rs:21-45,canonicalize + starts_with,非存在 leaf 走 parent canonicalize)— **fs 工具直接复用这两个函数**(需把 `resolve_in_root` 从私有改 pub(crate),sanitize 已是 pub(crate))。
- 现有 commands:fs_create_dir/fs_create_file/fs_rename/fs_move(file_ops.rs:94-148)— 但这些是 webview 直调 command,不是 agent 工具;agent fs 工具要的是 read/list/write/delete 更全一组,落在 tools.rs 而非 file_ops.rs(file_ops.rs 提供路径安全 helper)。
- workspace 根:webview 侧 workspaceStore 有 `folderPath`(workspaceStore.ts:20),Rust 引擎不知道。**缺口:LoopContext 需新增 `workspace_root: Option<PathBuf>`**,engine_run 加可选参数 `workspace_root: Option<String>`,chatConsoleStore engineRun 调用处(chatConsoleStore.ts:489-497)从 workspaceStore 传 activeWorkspace.folderPath。无头 Phase 24 再解决 tray 侧根路径来源(Open Question 1)。

**schema 设计(推荐):**
- `fs_list { path: string = "" }` → Readonly, rerunnable
- `fs_read { path: string }` → Readonly, rerunnable(大小上限:读入 >4KB 自动 artifact,prepare_tool_result 已处理;硬上限 1MB arg_error)
- `fs_write { path, content }` → HITL 候选(kind `fs_write`,params 含 path+content+operation), verify_first
- `fs_mkdir { path }` / `fs_delete { path }` → HITL, verify_first(rename/move 可并入 fs_write 候选的 operation 字段或独立 — 推荐独立 `fs_move { src, dest }` HITL)

**写 HITL vs exec 白名单 HITL 异同(HIGH):** 同:候选落库 → WAIT tool_result(`awaitingConfirmation:true`)→ 原子 consume → `[confirmed rerun]` settle。异:fs 写确认后**重执行也可在 Rust command 内做**(`engine_fs_apply` 风格,consume 后执行 fs 操作再 append_tool_result)— 与 exec 同一模式,可共用一个泛化 command 或各一个;fs 不需要白名单(边界即策略:workspace 内 HITL、越界 error)。

### 4. deliverable 生成原生

**TS 语义规格(HIGH,generateDeliverable.ts):**
- 工具 schema:`{ code: enum['prd'], title: min1, draft: min1, confirmationToken?: min1 }` strict(generateDeliverable.ts:28-33)。
- **注意:TS 版本模型自己写 draft**(description:81-84 "You produce the full draft content yourself in the `draft` parameter"),不是 LLM 二次调用!CONTEXT 说「调 llm.rs 复刻 generateDeliverable prompt 语义」— 语义复刻的对象是**候选/确认/落槽链路**,生成本体 = 模型在 tool args 里给 draft。因此 Rust 版 `generate_deliverable` 工具是纯候选入队:validate args → `create_candidate(conn, "deliverable_draft", params, …)`(confirmations.rs:163,已带 code/productId/title/draft 四键 dedup,confirmations.rs:176-179)→ AwaitConfirmation。**不需要在工具内调 LLM** — 最小实现。若 planner 想要「Rust 代笔 draft」那是新能力,超出复刻范围(Open Question 2)。
- 候选 payload 形状:照 knowledge_write 模式 `{kind: "deliverable_draft", confirmationToken, code, title, draft, productId}`;SLOT_BY_CODE 映射 prd→DEL-REQ-01(generateDeliverable.ts:26)TS 侧保留(落槽是 TS 动作)。
- 等待文案 wait_value:类比 CONFIRMATION_REQUIRED_KNOWLEDGE(tools.rs:29),如 "Explicit confirmation is required before committing the deliverable."

**落槽 command `engine_commit_deliverable`(HIGH):**
- 对齐 engine_append_tool_result 模式(commands.rs:262-275 + 可测核心 284-367)。签名建议:
  `engine_commit_deliverable(session_id, token, code, title, edited_draft, product_id, doc_id, version, fts_hit_count, fts_immediate_hit) -> Result<(), AppError>`
  或者更薄:webview 先 executeTool 落槽(TS 写 rndStore/knowledgeRepo,过渡期合法)拿到 result,再调 command 落 `deliverable_committed` 事件 + consume 候选。
- 内部 = `confirmations::confirm` + `consume(token, None)`(deliverable 锁定决策:expected_params=None,hash 恒匹配,confirmations.rs:241-244 注释已写明)+ `event_log::append` deliverable_committed(payload 与 chatConsoleStore.ts:786-790 逐字段一致:docId/version/slotCode/code/ftsImmediateHit/ftsHitCount/sessionId/eventId)+ scope 继承(candidate.session_id 所在 session)。
- 消费顺序沿用 TS 不变量:consume 先于事件落库双写防护(generateDeliverable.ts:48-49 先 confirm→consume→写)。

### 5. carry-in 接缝迁移

**接缝 ① deliverable_committed(chatConsoleStore.ts:786-791):**
- 现状:`sessionRef.current.appendAuxEvent('deliverable_committed', {docId, version, slotCode, code:'prd', ftsImmediateHit, ftsHitCount, sessionId, eventId})` + `flushEvents()` → eventStore INSERT INTO agent_events(22-VERIFICATION SC-3 证据链:chatConsoleStore.ts:786 → chatSession.ts:192 → eventStore.ts:151)。
- 迁移:commitToSlot 内 executeTool 成功后,把 appendAuxEvent+flushEvents 两行(chatConsoleStore.ts:786-791)替换为 `engineCommitDeliverable({...payload, sessionId})` invoke(api.ts 加包装,参照 engineAppendToolResult 先例 api.ts:80-109)。payload 字段逐字保留。

**接缝 ② consumeIntoMemories(chatConsoleStore.ts:713-715):**
- 现状:`store.confirm(token)` + `store.consumeIntoMemories(token)` — 两条 TS UPDATE memory_candidates(memoryStore.ts:620-687:confirm 的条件 UPDATE + consume 原子 UPDATE + insertMemory INSERT memories 表)。
- Rust 侧已有:`confirmations::insert_memory_candidate`(confirmations.rs:324)是 INSERT;**confirm/consume-into-memories 的 Rust 侧实现尚缺**,需新增(移植 memoryStore.ts:600-687 的三条 SQL:confirm UPDATE、consume UPDATE、insertMemory INSERT 含 supersede 逻辑 memoryStore.ts:698-712)。SQL 已是 named_params 风格先例(confirmations.rs:199-266),逐字节移植 + `concurrent_consume_exactly_one_wins` 式测试。
- command:`engine_consume_memory(candidate_token) -> Result<Value, AppError>`(返回 MemoryRecord 形状供 TS toast);confirm 可并入 command 内先 confirm 再 consume(用户点「已记住」是一次动作)。TS 侧:chatConsoleStore.ts:713-715 两行换成一次 invoke;`store.confirm` 删除。rejectMemory(735)已走 store.reject — 也属 TS 写 memory_candidates!22-VERIFICATION 只点名 confirm/consume,但 reject 同表同模式,**建议顺手同迁(engine_reject_memory 或复用 engine_consume_memory 的 sibling)**,planner 定(注意 22-VERIFICATION SC-3 字面只要求两处;reject 是同类残留,迁移成本一个 if)。

### 6. 降级提示 + TOOL-04 测试锁定

**系统提示组装点(HIGH):**
- `ROLE_AND_TOOL_RULES` 常量 loop_runner.rs:89-93,`build_system_prompt`(loop_runner.rs:91-93)拼 core_context。注释明说「Phase 23 re-adds tools and this prompt together」。**落点:替换/扩展 ROLE_AND_TOOL_RULES**,新增段:现有原生工具清单(exec/fs/knowledge/deliverable)+ 降级文案(例:"Task and schedule CRUD tools are not available in this version; guide the user to create them manually in the Tasks/Schedule views. They return in a later release.")。
- context_assembler.rs 的五段注入(context_assembler.rs:160-267)不动 — 指南块属 role/rules,不是检索段。

**TOOL-04 测试锁定(建议):**
- 单元:cargo test 断言 `tools::schemas()` 的 name 集合 == 有头暴露集(本来就只有一个注册表,天然一致);真正的锁定点是**断言工具执行路径零 webview invoke**:`grep -r "invoke" src-tauri/src/engine/` 为空(结构性检查,可在 verification 用 grep gate,不必写测试)。
- 加一条 loop 集成测试:scripted FakeLlm 触发 exec 白名单命令(如 `cmd /c echo`),断言 tool_result + ToolOutput 事件 + 子进程退出。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 子进程超时/取消 | 手写线程 + channel | tokio::time::timeout + select! + CancellationToken | 已有依赖,select! 三行 |
| Windows 树杀 FFI | Job Object 绑定 | `taskkill /PID <pid> /T /F`(std::process) | 竞态窗口可接受;Job Object 是真实漏杀时的升级路径 |
| 候选去重/原子消费 | 新表新逻辑 | confirmations::create_candidate/consume | 已测试并发恰一 |
| 确认后 settle | 新事件写法 | append_tool_result_inner(`[confirmed rerun]`) | 已测试锁定 |
| shell 拆参 | shlex 移植 | 无 shell,argv 数组 schema | 消灭整类转义 bug |
| 大结果落 artifact | 新截断逻辑 | event_log::prepare_tool_result | loop_runner.rs:340 已接 |

## Common Pitfalls

1. **同步 execute 混入 await**:在 `tools::execute`(同步)里塞 exec 会编译不过或阻塞 runtime — 必须新 async 入口,loop 分发点统一改 await。
2. **CancellationToken 未传到工具层**:cancel 目前只在 loop 的 LLM 边界检查(loop_runner.rs:249);exec 长命令必须把 token 传入 execute_async,否则取消后子进程继续跑(SC/TOOL-02「取消」项失败)。
3. **workspace_root 为 None 时 exec/fs 静默错**:ToolCtx 无根路径时 exec cwd/fs 应返回 Failed(arg_error=false)而非 panic;description 里写明需要 workspace。
4. **deliverable 双写**:consume 成功但 webview 后续步骤失败 = TS 已知取舍(chatConsoleStore.ts:803-804 注释);Rust command 内保持 consume→append 顺序,勿倒置。
5. **kill_on_drop 单独不够**:Windows 上 kill_on_drop 只杀直接 child;树杀必须显式 taskkill /T。
6. **白名单匹配大小写/路径**:Windows 命令可能是 `git.exe` 或全路径 — basename + to_lowercase 归一后再匹配。
7. **新 EngineEvent 变体破坏旧 webview**:kind switch 默认分支必须忽略未知 kind(检查 ChatPanel onEvent handler 有 default fallthrough)。

## Open Questions

1. **无头 run 的 workspace_root 来源** — engine_run 由 webview 传参后,Phase 24 托盘后台 run 谁供根路径?
   - What we know: workspace folderPath 只在 zustand(kv_store JSON)。
   - Recommendation: Phase 23 先参数化;Phase 24 可让 Rust 在每次 engine_run 时把 workspace_id→root 缓存进 kv(`agent.workspace.roots`),后台 run 从 kv 读。
2. **Rust 是否要「代笔 draft」** — TS 语义是模型在 args 给 draft;若产品期望 Rust 调 llm.rs 生成,是新增能力。
   - Recommendation: 严格复刻(args 给 draft),不调 LLM;最短路径且与 TS parity 一致。
3. **memory reject 是否同迁**(见 §5)— 22-VERIFICATION 只锁两处,reject 是同类残留。
   - Recommendation: 顺手迁,一个 sibling command。

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | cargo test(Rust, 118 passed baseline)+ npm test/vitest(TS, 241 passed) |
| Config | 内置(cargo)+ package.json |
| Quick run | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Full suite | `cargo test && npm test && npm run lint` |

### Requirements → Test Map
| Req | Behavior | Test Type | Command |
|-----|----------|-----------|---------|
| TOOL-01 | 注册表含 exec/fs/deliverable + schema | unit | `cargo test tools::` |
| TOOL-02 | 超时/取消/树杀/白名单 HITL | unit+integration | `cargo test exec` |
| TOOL-03 | 系统提示含降级文案 + 无 PM 工具 | unit | `cargo test build_system_prompt` |
| TOOL-04 | 工具路径零 webview 依赖 | grep gate + cargo test | verification grep |
| carry-in | 两接缝 TS 写路径为零 | grep gate | `grep -r "appendAuxEvent('deliverable_committed'" src` 为空;`grep consumeIntoMemories src` 仅测试/归档 |

### Wave 0 Gaps
- 无新框架需求;fake-exec 测试需可移植命令(Windows `cmd /c echo`,cfg 目标平台分支)。

## Sources

### Primary (HIGH)
- Codebase:tools.rs / loop_runner.rs / commands.rs / confirmations.rs / file_ops.rs / channel.rs / state.rs / lib.rs / Cargo.toml / migrations/0001 / generateDeliverable.ts / registry.ts / chatConsoleStore.ts / memoryStore.ts / 22-VERIFICATION.md / 23-CONTEXT.md / ROADMAP.md / REQUIREMENTS.md(全部 file:line 已引)
### Secondary (MEDIUM)
- tokio::process / kill_on_drop、Windows taskkill /T 语义 — 训练数据,需 implementation 时以 `cargo doc`/官方 docs.rs 复核(版本 1.x 稳定多年,风险低)

## Metadata
**Confidence:** HIGH(全部集成点有一手代码证据;仅 Windows 进程树杀细节 MEDIUM)
**Research date:** 2026-08-24
**Valid until:** 2026-09-24
