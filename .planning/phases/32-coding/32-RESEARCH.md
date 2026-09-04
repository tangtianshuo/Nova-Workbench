# Phase 32: coding 工具地基 - Research

**Researched:** 2026-09-04
**Domain:** Rust engine coding tools (read/write/edit/grep) + exec whitelist hardening + code_edit diff approval + repo scope lock + Windows process/path semantics
**Confidence:** HIGH (codebase grounding + official Rust/npm docs verified)

## Summary

Phase 32 is a增量扩展 of the existing engine, not new architecture. All five integration seams verified in source: `tools.rs` static registry (ToolSpec + ToolKind), `fs_ops.rs` structural template (resolve → free-read / HITL-write → pure sync `apply_operation`), `exec.rs` whitelist + `spawn_core`, `confirmations.rs` open kind registry with params_hash dedup, `scheduler.rs` cancel cascade (token cancel → `kill_tree` in `spawn_core` already handles Windows `taskkill /T /F`).

The flagged MEDIUM unknown (Windows npm resolution) is now **resolved with verified facts**: Rust std `Command` on Windows calls `CreateProcessW` which (a) never consults PATHEXT — `Command::new("npm")` fails because npm is `npm.cmd`; (b) since the BatBadBut fix (Rust ≥1.77.2, CVE-2024-24576), spawning a **resolved full path** to a `.cmd`/`.bat` is safe — std internally routes through `cmd.exe` with proper argument escaping. The fix is therefore: resolve the command via the `which` crate (PATH+PATHEXT-aware) against a **sanitized system PATH**, then spawn the absolute path. Never hand-build `cmd /c …` (reintroduces the injection CVE).

One deviation from the milestone-locked "4 new crates" list: this phase additionally needs **dunce** (canonicalize without `\\?\` verbatim prefixes — required for repo scope comparison), **which** (PATHEXT resolution), and **sysinfo** (CP-8 orphan PID enumeration). All three are tiny, battle-tested, and justified below; planner should accept them as Phase-32-scoped additions.

**Primary recommendation:** Build `code_ops.rs` as a line-for-line structural clone of `fs_ops.rs` bound to a new `repo_root` (not workspace_root), with `code_edit` as a new confirmation kind whose params are exactly `{operation, path, old_string, new_string, root}`; harden `exec.rs` with which-resolution + env scrub + pair-granularity learning + git flag blacklist; render diffs with lazy-loaded `react-diff-view` + `diff` parsing Rust-generated unified text.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **repo 绑定模型:** 绑定宿主 = workspace 级;工作区 git 检测出 repo_root 随 workspace 持久化(复用 workspace_id stamping 先例);工作区内锁定单 repo_root(取首个 git 根),不支持 repo 列表;绑定时机 = 打开工作区后台 git 检测自动绑定 + 设置页可改,不在工具首次调用时弹卡;Nova 狗粮:dev 模式一键绑定 Nova 自身仓库
- **diff 审批卡体验:** 同 turn 多文件变更 = 逐张排队确认(处理一张亮下一张,徽章显示 N 张待审);reject 附原因回传 agent,该 edit 不落盘、run 继续可调整重试,不中止整个 run;diff 上下文固定 3 行,不做用户可调设置;沉淀入口 = diff 卡「沉淀改动摘要」按钮直接走 knowledge_write 候选流(复用第二段确认,零新管线)
- **exec 白名单产品行为:** 出厂极小只读预置(git status/diff/log + ls/dir),其余全靠首遇「允许一次/总是/拒绝」学习;「总是允许」作用域 = 工作区级(键 = workspace_id,换工作区重新学);白名单存储 = kv_store JSON,不建新表;git 危险 flag 黑名单命中 = 硬拒绝(工具直接 Failed 回原因,不弹卡,不提供「总是允许」出口)
- **进度与取消:** TabRunPanel 进度粒度 = 当前工具名 + 目标文件 chip(exec 显示命令截断),不展示完整参数;取消时未决 diff 卡自动 reject + 审计事件(复用 run 取消级联,重跑时 agent 重新提案),不保留 pending;exec 长任务输出 = 尾部 N 行实时刷新(tail 语义,UI 折叠可展开);CP-8 崩溃孤儿进程清杀 = Windows 主场先做(PID 枚举 + cmdline 匹配 repo_root 前缀),macOS/Linux 记 debt

### Claude's Discretion
- code_ops.rs 内部结构、diff 文本生成(similar UnifiedDiff)、前端 diff 视图组件拆分等实现细节
- Windows npm .cmd/.bat 解析方案(research-phase 深研后定)— **已定,见 Standard Stack / Pitfall 1**

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGINE-01 | Research-Action 循环:read/grep 零确认自由、write/edit/exec 走门、coding persona prompt 编码契约 | code_ops read/grep = Readonly kind 先例(tools.rs ToolKind::Readonly);exec.rs 三态结果 |
| CODE-01 | coding 5 工具 Rust 原生,exec 扩展现有 exec.rs;str-replace 唯一性校验 + 失败回带行号;apply 前重读重校验 | fs_ops.rs 结构模板 + Pitfall 3 错误文案语义 + CP-3 apply 重校验模式(fs_ops apply_operation 重跑 resolve_deep 先例) |
| CODE-02 | code_edit 新 kind,hash 域 = {path, old_string, new_string};react-diff-view 懒加载;confirmed 重放走 Rust tools::execute | confirmations.rs kind 开放注册 + params_hash;Code Examples 4(parseDiff/Diff/Hunk) |
| CODE-03 | exec 白名单四绕过面收口 + 结构化回传 | Pitfall 1(which + PATHEXT + BatBadBut)、Pitfall 2(env scrub)、学习二元组、git flag 黑名单 |
| CODE-04 | repo 作用域锁,repo_root ≠ workspace_root,TOCTOU 再 resolve,Windows 大小写 | Pitfall 4(dunce canonicalize + 大小写统一比较) |
| CODE-05 | 取消与进度 + CP-8 孤儿进程恢复清杀 | scheduler cancel cascade 已验证;sysinfo + 记录 PID 方案(Pitfall 5);tabRunStore tool_start/tool_end/tool_output 钩子已实查 |
| CODE-06 | diff 卡沉淀进第二大脑 | 复用 knowledge_write 候选流,零新管线(CONTEXT 锁定) |
</phase_requirements>

## Standard Stack

### Core — Rust (src-tauri/Cargo.toml additions)

| Crate | Version | Purpose | Why Standard | Confidence |
|---|---|---|---|---|
| similar | 3.2 | unified diff 生成(`TextDiff::from_lines` + `UnifiedDiff`) | milestone 已锁;omp workspace 自身也 depend similar | HIGH (locked) |
| ignore | 0.4 | repo 遍历(尊重 .gitignore) | ripgrep 同源 | HIGH (locked) |
| grep-searcher | 0.1 | 行搜索 sink(decorate lines) | ripgrep 同源 | HIGH (locked) |
| grep-regex | 0.1 | pattern → RegexMatcher | ripgrep 同源 | HIGH (locked) |
| **dunce** | 1 | `canonicalize` 不带 `\\?\` verbatim 前缀 | std canonicalize 返回 `\\?\C:\…` 破坏 starts_with 比较(rust-lang#42869);dunce 是事实标准解(Stack Overflow 公认答案) | HIGH (docs.rs + rust-lang issue) |
| **which** | 7 | Windows PATH+PATHEXT 命令解析 | std CreateProcess 不查 PATHEXT(rust-lang#37519/#94743);which 模拟 shell 查找语义 | HIGH (docs + issues) |
| **sysinfo** | 最新 0.3x | CP-8 进程枚举 + `Process::cmd()` cmdline | `System::new_all()` + `processes()` + `cmd()` 官方 API,跨平台 | HIGH (docs.rs) |

### Core — npm (package.json additions)

| Package | Version | Purpose | Why Standard |
|---|---|---|---|
| react-diff-view | 3.3.3 | diff 渲染(Diff/Hunk/parseDiff) | milestone 已锁;unified 模式 + 行高亮 |
| diff | 9.0.0 | `parsePatch` 不用 — **用 react-diff-view 自带 parseDiff** | 见 Pitfall 6:parseDiff 直吃 unified 文本,diff 包可能根本不需要 |

> **`diff` 包可能可省:** react-diff-view 的 `parseDiff(text)` 直接解析 unified diff 文本(官方 README 用法,见 Code Examples 4)。Rust 侧 similar 直出 unified 文本 → 前端 parseDiff → 渲染,`diff` npm 包无参与点。Plan 时先只装 react-diff-view,若 token 级高亮需要再做行内 diff 才补 `diff` 包。**两个包必须 `React.lazy()` 懒加载在 diff 卡组件内部**(Phase 31 297KB chunk 教训,UI-SPEC 已锁)。

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| which crate | 手写 PATHEXT walk(~40 行) | 手写要处理 cwd 前置、PATHEXT 大小写、`.` 隐含 extension — which 已被 cargo 生态重度验证,别手滚 |
| dunce | 手动 strip `\\?\` 字符串 | 字符串 strip 处理不了 `\\?\UNC\server\share` 形态;dunce 按语义转换 |
| sysinfo | windows crate toolhelp snapshot | windows crate 手写 snapshot + WMI 查 cmdline 数百行;sysinfo 一次调用 |
| react-diff-view parseDiff | diff 包 parsePatch | parsePatch 输出 shape 与 react-diff-view 的 hunks prop 不兼容,需转换层 — 多一个依赖多一层转换,不划算 |

**Installation:**
```bash
# Rust (src-tauri)
cargo add similar ignore grep-searcher grep-regex dunce which sysinfo
# npm(先只装这一个,验证后再决定 diff)
npm install react-diff-view@3.3.3
```

## Project Constraints (from CLAUDE.md)

- Tech stack React 19 + Tauri v2 + Tailwind v4 已锁,不重构;No sidecar
- 前端:semantic token classes only(`bg-bg-primary` 等),禁 hex/`bg-white`;`cn()` className last;Phosphor duotone icons;Dialog/Card/Button/Badge 组合;懒加载 via React.lazy
- Rust 侧测试 = `#[cfg(test)] mod tests` + `mem_conn()`/`file_conn()` + current-thread tokio rt(见 fs_ops.rs/exec.rs 既有测试形态)
- GSD 工作流:不绕过直接改文件

## Architecture Patterns

### 1. code_ops.rs 结构(照抄 fs_ops.rs 骨架)

```
src-tauri/src/engine/code_ops.rs
├── consts: CANDIDATE_KIND = "code_edit", MAX_GREP_RESULTS, READ 默认行窗
├── resolve_repo(repo_root, rel) -> Result<PathBuf, ToolOutcome>   // fs_ops::resolve_deep 变体,root 换 repo_root + dunce
├── code_read(args, ctx)  -> ToolOutcome                           // Readonly;支持 offset/limit 分页(MP-10)
├── code_grep(args, ctx)  -> ToolOutcome                           // Readonly;ignore 遍历 + grep-searcher
├── code_write / code_edit (conn, args, ctx) -> ToolOutcome        // HITL → create_candidate("code_edit", …)
├── apply_edit(params) -> ToolOutcome                              // 纯同步 core,engine 侧 confirmed 重放调用
└── tests(mem_conn + temp dir + junction/case 测试)
```

关键差异 vs fs_ops:
1. **root 来源不同**:`ToolCtx` 需要 repo_root(fs_ops 用 workspace_root)。建议 `ToolCtx` 加 `repo_root: Option<PathBuf>` 字段(向后兼容 Option);无 repo_root 时 coding 工具返回 UI-SPEC 文案「未绑定代码仓库 — 请在设置中指定 repo 目录」的 Failed。
2. **params 不含全文内容**(CP-2):write 的 params = `{operation:"write", path, new_content, root}` 例外——write 必须带全文,这是它天生的;**edit 的 params = `{operation:"edit", path, old_string, new_string, root}`**,绝不带 diff 文本或文件快照(diff 在投影层由 old/new 渲染或 apply 后生成)。
3. **apply 重校验**(CP-3):`apply_edit` 必须 (a) 重跑 `resolve_repo`(TOCTOU 再 resolve,fs_ops apply_operation 已有同款先例);(b) **重读文件**重新做 old_string 唯一命中检查,失败回 Failed 带当前命中行号。

### 2. code_edit 确认管线(第四宿主)

- `confirmations.rs` 零改动:kind 是开放字符串,`create_candidate` 的 dedup kind 列表加 `"code_edit"` 进 `matches!`(exec_approval 同款 params_hash 去重)— **一行改动**。
- hash 域自动正确:params_hash 对整个 params JSON 计算;params 只含 {operation, path, old_string, new_string, root} → 同文件两次不同 edit = 两个 token,同 edit 重试 = 同 token(CP-2 测试直接可写)。
- confirmed 重放:Rust 命令侧加 `engine_code_apply`(照 `engine_fs_apply` / `engine_exec_confirmed` 先例),调 `code_ops::apply_edit(params)`;TS `executeTool` **不实现** coding 工具(锁定的先例)。
- reject 附原因:现有 reject 是 bool 无 payload。最 lazy 方案:reject 原因走**独立的一列或复用 summary 字段不理想** — 推荐给 `reject(conn, token, reason: Option<&str>)` 加可选参数,落 `rejected_at` 同行的扩展。若 schema 不动:reason 由前端经一条 `agent_events` 用户事件写入(事件日志已有用户事件先例),run 恢复时投给模型。**Plan 时二选一,倾向改 reject 签名 + ALTER TABLE 加 `reject_reason` 列(migration 0016)**,因为 run 等待恢复的最短路径是候选行本身携带原因。

### 3. exec.rs 四绕过面收口(CP-6)

**spawn 顺序(重写 spawn_core 入口,保持签名):**
1. `resolve_command(command, sanitized_path)` → `Option<PathBuf>`:非 Windows 直接 `which::which`;Windows 用 `which::which_in(command, None, cwd_parent_of_path)` 且**显式传入清洗过的 PATH**(绝不含 repo_root — 见 4)。解析失败 = Failed 回「command not found: {command}」(模型可换命令)。
2. 解析出的绝对 path 若 canonicalize 后位于 repo_root 内 → Failed(PATH 劫持面 3)。
3. `.cmd`/`.bat` 直接 `Command::new(resolved_path)` — **BatBadBut 修复后 std 自动经 cmd.exe 转发并正确转义**(Rust ≥1.77.2,项目 Rust 远新于该版本);**绝不手拼 `cmd /c`**(重新引入注入)。
4. env:`Command::envs(sanitized_env)` — 从父进程 env **scrub 后重建**(见 Pitfall 2),不 `env_clear`(env_clear 在 Windows 会破坏需要 SystemRoot 的子进程)。

**学习粒度:** `add_command_to_whitelist(conn, command, first_arg)` 存二元组 — `WhitelistEntry.subcommands` 字段已存在,学习时填 `Some(vec![first_arg])` 即可,**schema 零改动**;出厂预置 `dir/ls/cat/rg` 等也收 `subcommands: None`→保持(只读命令无子命令注入面)。白名单键按 CONTEXT = workspace 级:`WHITELIST_KEY` 变为 `format!("agent.exec.whitelist.{workspace_id}")`(kv_store JSON 先例,不建表)。

**git 危险 flag 黑名单:** exec 入口处 `args` 任一元素以 `--output`/`--upload-pack`/`-c`/`--exec`/`--exec-path`(前缀匹配,大小写不敏感)且 command == git → 直接 `Failed { message: "已拒绝:git 危险操作({flag})" }`,不弹卡(UI-SPEC 锁定)。硬编码 4-5 个 flag 的 const 数组 + 一条测试。

### 4. repo 绑定与作用域锁(CP-7 / CODE-04)

- workspace 打开时后台 `git rev-parse --show-toplevel`(或向上找 `.git` 目录 — 更 lazy:纯 fs 向上 walk,不依赖 git 二进制)取 repo_root,随 workspace 持久化(workspace_id stamping 先例)。
- 路径校验:`resolve_deep` 变体,内部 canonicalize 全部换 `dunce::canonicalize`;边界比较 = 双侧 dunce canonicalize 后,Windows 上 `to_string_lossy().to_lowercase()` 前缀比较(`starts_with` + 分隔符边界),非 Windows 字节比较。
- **read/grep 放宽到工作区**(CODE-04):read/grep 用 workspace_root 的 fs_ops 语义还是 repo_root?CONTEXT 说「read/grep 放宽到工作区」— 即 read/grep 复用现有 `resolve`(workspace_root),write/edit/exec 锁 repo_root。但 CP-7 警告 coding 工具不得读 Nova 自身数据 — **裁定:read/grep 也锁 repo_root,但允许 Nova 工作区文档作为 second scope 由既有 knowledge_search 覆盖**。Plan 时按 REQUIREMENTS CODE-04 原文执行:write/edit/exec 锁 repo,read/grep 锁 repo ∪ workspace 但**排除 Nova 数据库文件**(app 数据目录路径黑名单,canonicalize 后拒绝)— 一条测试:`fs_read` 目标 = Nova 数据库路径 → 拒绝。

### 5. 前端(照 32-UI-SPEC,全部标准模式)

- 第四宿主 = `WorkspaceConfirmCard.tsx` 旁的新 `CodeEditConfirmCard`(或并入其 kind switch — 看现有结构,**该文件是一个 host 渲染多 kind 的形状,grep 显示它 switch kind**;倾向加 case 而非新组件,除非 diff 卡体量大)。
- diff 体 `React.lazy(() => import('./DiffBody'))`,Suspense fallback = `Skeleton`;DiffBody 内 `parseDiff` + `Diff/Hunk`。
- TabRunPanel:`tabRunStore` 已处理 `tool_start`/`tool_end`/`tool_output` 事件(实查 247-265 行)——进度 chip 只需在 `tool_start` payload 带 `{targetFile?}` 或从 args 提取;exec tail 输出已走 `ToolOutput` 事件流,前端维护尾部 N 行 ring buffer 即可,**引擎零改动**。

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| unified diff 生成 | 手写 LCS/diff | similar `TextDiff::from_lines().unified_diff().context_radius(3)` | 边界情况(无尾换行、CRLF)成熟处理 |
| 文件遍历 + .gitignore | 手写 walker + ignore 解析 | `ignore::WalkBuilder` | gitignore 语义复杂(negation、嵌套) |
| grep 行匹配 | 读全文 + regex find | `grep_searcher::Searcher` + `grep_regex::RegexMatcher` + sinks | 大文件流式、二进制检测、行号,ripgrep 同款 |
| Windows PATHEXT 解析 | 手写 PATH walk | `which` crate | PATHEXT/cwd/大小写边角 |
| `\\?\` 前缀路径处理 | 手动字符串 strip | `dunce::canonicalize` | UNC 形态语义转换 |
| Windows 进程枚举 + cmdline | toolhelp/WMI 手写 | `sysinfo` | 官方 API 一次调用 |
| diff 前端渲染 | 手写 +/- 行列表 | react-diff-view `parseDiff` + `Diff`/`Hunk` | hunk 折叠、行号 gutter、token 高亮扩展点 |
| 确认队列/去重/原子消费 | 任何新机制 | `confirmations::create_candidate/consume/reject` 现有 SQL | 原子消费不变量已在 WHERE 子句验证 |

**Key insight:** 这个 phase 的所有"难"问题(路径安全、确认原子性、取消级联、输出流)在 v0.3.2 引擎里都已有验证过的答案 — 任务是**换 root、加 kind、收紧 exec**,不是发明机制。

## Common Pitfalls

### Pitfall 1: Windows npm 解析 — `Command::new("npm")` 静默失败(已解,MEDIUM→HIGH)
**What:** CreateProcessW 只补 `.exe`、不查 PATHEXT,找不到 `npm.cmd` → spawn error 123 或 NotFound;且 exec.rs 现有 `normalize_command` 只剥 `.exe`,白名单匹配 `npm.cmd` 归一后是 `npm.cmd` ≠ `npm`。
**Fix:** (a) `normalize_command` 同时 strip `.exe`/`.cmd`/`.bat` 后缀;(b) spawn 前用 `which` 解析绝对路径;(c) `.cmd` 交 std 直接 spawn(BatBadBut 已修,Rust ≥1.77.2 自动 cmd.exe 转发 + 转义)。**绝不手拼 `cmd /c`** — 那是 CVE-2024-24576 的原始形态。
**Warning signs:** coding run 里 npm/cargo 全部 spawn failed;白名单「总是允许」后命令仍失败。

### Pitfall 2: env 泄漏与过度清洗两头翻车(CP-6)
**What:** 透传全 env → `GEMINI_API_KEY` 经 stdout 进 tool_result 进 LLM 上下文;`env_clear` → Windows 子进程(npm/node)缺 `SystemRoot`/`APPDATA` 直接崩。
**Fix:** scrub 策略 = 复制父 env,删除名字含 `KEY`/`TOKEN`/`SECRET`/`PASSWORD`(大小写不敏感)的变量,保留其余(PATH 单独再清洗:移除 repo_root 前缀项,防 PATH 劫持)。比 allow-list 少破兼容,满足 CP-6 测试(child env 不含任何 `*KEY*`)。
**Test:** 一条 spawn 测试断言子进程 `env` 输出无 `*KEY*`(用 `cmd /c set` 或 `env` 回显)。

### Pitfall 3: str-replace 错误文案即模型接口(错误语义决定自纠率)
**What:** 模糊的 "edit failed" 导致模型盲目重试烧 token。错误消息的**结构**决定模型能否自纠。
**Fix(照 pi-edit / Claude Code 语义,消息三件套):**
- 未找到:`old_string not found in {path}. The file may have changed — re-read the file and retry with the exact current content.`
- 非唯一:`old_string found {n} times in {path} (lines {lines}). Include more surrounding lines to make it unique.`
- stale(apply 时重校验失败,CP-3):`file changed since the edit was proposed; old_string no longer matches at the recorded position. Re-read {path} and retry.`
**规则:** 失败必带 path + 行号(找到的全部命中行号)+ 明确的下一步指令;old_string 匹配保持**字节精确**(MP-11:只归一化 path,不归一化 content)。

### Pitfall 4: canonicalize 的 `\\?\` 前缀 + Windows 大小写(CP-7)
**What:** `std::fs::canonicalize("C:\\Repo")` 返回 `\\?\C:\Repo`;与用户配置的 `C:\Repo` 做 `starts_with` 永远 false → 全部路径误判越界。混写 `C:\` vs `c:\` 同理。
**Fix:** 所有 canonicalize 换 `dunce::canonicalize`;边界比较前双侧同形;Windows 上比较用 lowercase 字符串前缀 + 分隔符边界。junction/symlink 由 canonicalize 逐段解析天然覆盖(fs_ops resolve_deep 逐段 canonicalize 模式保持)。
**Test(三件套,进 success criteria):** junction 指向 repo 外 → 拒;`C:\` vs `c:\` 混写 → 一致判定;目标 = Nova 数据库路径 → 拒。

### Pitfall 5: CP-8 孤儿进程误杀(Windows 主场)
**What:** CONTEXT 方案 =「PID 枚举 + cmdline 匹配 repo_root 前缀」— 单独用 cmdline 前缀匹配会误杀用户的 IDE/终端(它们的 cmdline 也含 repo 路径)。
**Fix(双层):** (a) **主层:记录 PID** — `spawn_core` spawn 成功后把 `pid` 写进 tool_call/tool_output 事件 payload(事件 schema 增量的一部分,CP-4 清单里列上);restore.rs 恢复时对记录的 running exec PID 用 sysinfo 查存活,存活才 taskkill。(b) 副层(防御):cmdline 匹配额外要求进程名 ∈ 引擎已知命令集(basename 与事件记录的 command 一致)。恢复时同时输出「consumed 但无对应 tool_result」审计事件(CP-8 追责项)。
**Where:** restore.rs 尾切之后加一步;Windows-only `#[cfg(windows)]`,macOS/Linux 记 debt。

### Pitfall 6: react-diff-view 接入点用错
**What:** 用 `diff` 包的 `parsePatch` 喂 react-diff-view — shape 不兼容,被迫写转换层;或忘记 lazy-load 打出 300KB chunk。
**Fix:** 直接 `parseDiff(unifiedText)`(react-diff-view 自带导出)→ `{type, hunks}` → `<Diff viewType="unified" hunks={…} diffType={…}>`;3 行上下文在 **Rust 侧** similar `.context_radius(3)` 定死(投影层零配置);整卡 `React.lazy` + `Skeleton` fallback。行高亮样式用 token 派生(`bg-success/10` / `bg-danger/10`),禁 raw hex(UI-SPEC)。

### Pitfall 7: CP-4 事件种类清单(流程门)
新事件/payload 增量点:`code_edit` tool_call/tool_result、exec tool_call payload 加 `pid`、reject 原因的落点(候选行或事件)。**首个 plan 必须产出清单 + 双侧 fixture 同 commit + CI 互锁断言**(event_log.rs event_type 常量 ↔ fixture 覆盖清单)。这是本 phase 的事,不是 P2 的。

### Pitfall 8: exec_approval 候选 params 里 cwd 与 repo_root 错位
exec 现有 candidate params 带 `cwd: workspace_root`。coding 场景 exec 的 cwd 应 = **repo_root**(CODE-04)。confirmed 重放 `engine_exec_confirmed` 用 params 里的 cwd,不需要引擎状态 — 改 params 生成处即可,但 parity fixture 要覆盖新 cwd 值。

## Code Examples

### 1. Windows-safe exec spawn(exec.rs 收口核心)
```rust
// Source: rust-lang/rust#37519, #94743 + BatBadBut advisory(CVE-2024-24576)+ which crate docs
fn sanitize_env(env: &[(String, String)]) -> Vec<(String, String)> {
    env.iter()
        .filter(|(k, _)| !["KEY", "TOKEN", "SECRET", "PASSWORD"].iter().any(|p| k.to_uppercase().contains(p)))
        .cloned()
        .collect()
}

async fn spawn_resolved(command: &str, args: &[String], cwd: &Path, /* … */) -> std::io::Result<Child> {
    // which_in with a PATH that excludes repo_root (PATH hijack, CP-6)
    let path_no_repo = sanitized_path_without(cwd);
    let resolved = which::which_in(command, Some(path_no_repo), cwd)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, format!("command not found: {command}")))?;
    // resolved may be a .cmd — Rust ≥1.77.2 routes .bat/.cmd through cmd.exe
    // with proper escaping. NEVER build "cmd /c ..." manually (CVE-2024-24576).
    let mut cmd = tokio::process::Command::new(&resolved);
    cmd.args(args).current_dir(cwd).kill_on_drop(true)
        .stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    for (k, v) in sanitize_env(&std::env::vars().collect::<Vec<_>>()) {
        cmd.env(k, v);
    }
    cmd.spawn()
}
```

### 2. repo 边界校验(CP-7)
```rust
// Source: dunce docs.rs + fs_ops.rs resolve_deep pattern
fn within_repo(resolved: &Path, repo_root: &Path) -> bool {
    let (a, b) = match (dunce::canonicalize(resolved), dunce::canonicalize(repo_root)) {
        (Ok(a), Ok(b)) => (a, b),
        _ => return false,
    };
    if cfg!(windows) {
        let (a, b) = (a.to_string_lossy().to_lowercase(), b.to_string_lossy().to_lowercase());
        a.starts_with(&b) && (a.len() == b.len() || a.as_bytes().get(b.len()) == Some(&b'\\'))
    } else {
        a.starts_with(&b)
    }
}
```

### 3. similar unified diff(3 行上下文,固定)
```rust
// Source: similar crate docs (unified diff example)
use similar::{ChangeTag, TextDiff};
let diff = TextDiff::from_lines(&old_content, &new_content);
let mut buf = String::new();
for (idx, hunk) in diff.grouped_ops(3).iter().enumerate() {   // 3 = context lines (CONTEXT 锁定)
    if idx > 0 { buf.push_str("@@\n"); }
    for op in hunk {
        for change in diff.iter_inline_changes(op) {
            let sign = match change.tag() { ChangeTag::Delete => '-', ChangeTag::Insert => '+', ChangeTag::Equal => ' ' };
            buf.push(sign);
            buf.push_str(change.to_string_lossy().as_ref());
        }
    }
}
// 或者直接用 similar::udiff::UnifiedDiff 流式输出 — 生成时机:候选创建时算一次存 diff 进候选展示层
```

### 4. 前端 diff 卡体(懒加载)
```tsx
// Source: react-diff-view official README (npmjs)
const DiffBody = React.lazy(() => import('./DiffBody')); // 内含 react-diff-view import

// DiffBody.tsx
import { Diff, Hunk, parseDiff } from 'react-diff-view';
export function DiffBody({ unifiedText }: { unifiedText: string }) {
  const [diff] = parseDiff(unifiedText); // throws on malformed input — wrap in error boundary
  return (
    <Diff viewType="unified" hunks={diff.hunks} diffType={diff.type}
          className={cn('font-mono text-xs')}>
      {hunks => hunks.map(h => <Hunk key={h.content} hunk={h} />)}
    </Diff>
  );
}
```

### 5. str-replace 非唯一错误(CODE-01 错误文案)
```rust
let hits: Vec<usize> = content.match_indices(&old_string).map(|(i, _)| {
    content[..i].matches('\n').count() + 1
}).collect();
match hits.len() {
    0 => Failed(format!("old_string not found in {path}. The file may have changed — re-read the file and retry with the exact current content.")),
    1 => { /* apply */ },
    n => Failed(format!("old_string found {n} times in {path} (lines {}). Include more surrounding lines to make it unique.",
        hits.iter().map(|l| l.to_string()).collect::<Vec<_>>().join(", "))),
}
```

### 6. CP-8 孤儿清杀(Windows)
```rust
// Source: sysinfo docs.rs (Process::cmd)
#[cfg(windows)]
fn kill_orphaned_execs(recorded_pids: &[(u32, String /* command basename */)]) {
    let sys = sysinfo::System::new_all();
    for (pid, cmd_base) in recorded_pids {
        if let Some(p) = sys.processes().get(&sysinfo::Pid::from_u32(*pid)) {
            if p.name().eq_ignore_ascii_case(cmd_base) {  // 双保险:PID + 进程名
                let _ = std::process::Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"]).status();
            }
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `Command::new("cmd") args ["/c", …]` 手动转发 | 解析绝对路径后直接 spawn(.cmd 由 std 安全转发) | Rust 1.77.2 (2024-04, CVE-2024-24576 修复) | 不再需要手拼 shell;`raw_arg` 只在确需原始参数时 |
| `std::fs::canonicalize` 裸用 | `dunce::canonicalize` | 长期现状 (rust-lang#42869 open) | Windows 路径比较场景必须 |
| 手写 exec 白名单 basename 匹配 | 现有 exec.rs 模式保持,收口为二元组 + which 解析 | 本 phase | CP-6 |

**Deprecated/outdated to avoid:** 任何 `cmd /c` 字符串拼接;`env_clear` 全清;手写 PATHEXT walk。

## Open Questions

1. **reject 原因的落点** — 改 `reject` 签名 + `reject_reason` 列(migration 0016)vs 前端独立事件。倾向前者(run 恢复读候选行即得),但涉及 schema 增量与双侧 fixture。Plan 时定。
2. **read/grep 的双作用域(repo ∪ workspace,排除 Nova 数据路径)vs 只锁 repo** — REQUIREMENTS CODE-04 原文允许放宽,CP-7 警告 Nova 数据。倾向:锁 repo 为主,Nova 数据路径黑名单兜底。Plan 时定,三件套测试不变。
3. **`diff` npm 包是否最终需要** — 默认不装;若 UI 需要 token 级行内高亮再补(懒加载同一 chunk)。

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Rust toolchain (≥1.77.2) | BatBadBut 修复依赖 | ✓(项目已用 Tauri v2 现代工具链) | — | — |
| npm/node | 狗粮 exec 测试 | ✓ | — | — |
| git | repo 检测(若走 fs 向上 walk 则不需要) | ✓ | — | 纯 fs `.git` 目录向上查找(推荐,零外部依赖) |
| Windows 11(主场) | CP-8 / 大小写 / junction 测试 | ✓ | 26200 | macOS 用例 cfg 跳过(MP-11) |

无 blocking 缺失。

## Validation Architecture

> nyquist_validation = false in config.json — SKIPPED per config.

测试面(既有 cargo `#[cfg(test)]` 模式,无需新框架):exec.rs 收口(解析/scrub/黑名单)、code_ops(边界/唯一性/stale)、confirmations(code_edit dedup)、scheduler cancel 级联已有 fake-LLM harness(24-04 先例)。前端无测试 runner — diff 卡验证靠 UAT。

## Sources

### Primary (HIGH confidence)
- 代码实查:`src-tauri/src/engine/{exec,fs_ops,confirmations,tools,scheduler}.rs`、`src/stores/tabRunStore.ts`、`src/ai/confirmations.ts`、`src-tauri/Cargo.toml`
- [Rust Security Advisory CVE-2024-24576](https://blog.rust-lang.org/2024/04/09/cve-2024-24576/) — .bat/.cmd 转义修复(Rust ≥1.77.2)
- [rust-lang/rust#37519](https://github.com/rust-lang/rust/issues/37519) / [#94743](https://github.com/rust-lang/rust/issues/94743) — Windows spawn 只补 .exe、不查 PATHEXT
- [rust-lang/rust#42869](https://github.com/rust-lang/rust/issues/42869) — canonicalize 返回 verbatim UNC
- [dunce docs.rs](https://docs.rs/dunce) / [sysinfo Process docs.rs](https://docs.rs/sysinfo/latest/sysinfo/struct.Process.html) / [react-diff-view npm](https://www.npmjs.com/package/react-diff-view)
- 项目研究:`.planning/research/{SUMMARY,PITFALLS}-V0.4.md`、`32-CONTEXT.md`、`32-UI-SPEC.md`

### Secondary (MEDIUM)
- which crate 版本 ~7.x(web search,未直连 docs.rs 核查 — plan 时 `cargo add` 以 registry 为准)
- pi-edit 错误文案语义来自 SUMMARY-V0.4 转述(训练数据 + v0.4 研究实查)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 4 个锁定 crate 复述 + 3 个新增均有官方 issue/docs 支撑
- Architecture: HIGH — 全部集成点源码实查(kind 开放、apply 先例、cancel 级联、tabRunStore 事件钩子)
- Pitfalls: HIGH — Windows 语义经官方 advisory/issue 验证;CP-8 误杀风险为本研究的防御性设计(MEDIUM)

**Research date:** 2026-09-04
**Valid until:** 2026-10-04(依赖版本 plan 时以 registry 复核)
