# STACK — v0.4 (coding Agent + 子 Agent + Pipeline + Skill)

**Researched:** 2026-09-04
**Method:** omp 浅克隆实查(`gh repo clone`,GitHub 直连被墙,gh 走通)+ crates.io / npm registry 版本核查(cargo search / npm view)。置信度除标注外均为 HIGH(实查源码/清单)。

---

## 0. 结论速览

| 决策 | 结论 |
|------|------|
| omp vendoring | **只 vendor `pi-diff`(992 行、零依赖、纯 std)**;其余 crate 全部不进 Cargo |
| Rust diff 计算 | `similar` v3.2.0(crates.io 直 depend);pi-diff 作备选 |
| Rust grep/遍历 | `ignore` 0.4 + `grep-searcher` 0.1 + `grep-regex` 0.1(ripgrep 同源三件套) |
| 前端 diff 审批卡 | `react-diff-view` 3.3.3 + `diff`(jsdiff)9.0.0 `parsePatch` 解析 Rust 传来的 unified diff 文本 |
| 子 Agent / Pipeline / Skill | **零新依赖**——全部复用现有引擎(scheduler/event_log/confirmations/manifest-as-data/FTS5) |

---

## 1. omp 逐 crate 评估(实查 /tmp/omp-research)

omp workspace 现有 10 crate(v18.1.8,edition 2024——注意:Nova 是 edition 2021,vendored crate 若声明 `edition.workspace` 需改本地声明,pi-diff 未用到 2024 特性,降回 2021 可编译)。逐个裁定:

### pi-diff — **VENDOR(唯一推荐)**
- 实查:`crates/pi-diff`,**992 行,Cargo.toml `[dependencies]` 段为空——纯 std**,jsdiff v9 兼容的 Myers O(ND) + line/word/structured-patch,自带 UTF-8 原生入口。
- 耦合:零。无 napi、无 workspace 运行时依赖(仅 version/license 走 `workspace = true`,vendor 时改成本地字面量即可)。
- 增益:与前端 jsdiff(`diff` npm 包)语义/输出逐位一致——审批卡前后端各自渲染同构。自写 Myers + tie-breaking 语义对齐 jsdiff 约 3-5 天且容易错。
- 裁定:**vendor 进 `src-tauri/vendor/pi-diff/`**,保留 MIT 头(照 ADR-0002 归属先例)。
- 备选:如果不想背 vendor 维护成本,直接用 `similar`(见 §3),二选一,不要都进。

### pi-walker — **不 vendor,自写更便宜**
- 实查:5,596 行,依赖 `ignore`/`globset`/`dashmap`/`rayon`/`windows-sys`。目录遍历快速路径(glob/grep 候选发现/AST 扫描),无 napi 耦合(文档明说 caller 不继承 N-API 依赖)。
- 增益评估:它的价值是给高频遍历做平台 fast-path + 缓存;Nova 5 工具的遍历需求(grep 候选、read 路径解析)由 `ignore` crate(walker 内建 gitignore 语义)+ `globset` 直接覆盖,这正是 pi-walker 自己依赖的东西。5.6k 行 + dashmap/rayon 换来的缓存层是 omp 高频 TUI 场景的优化,Nova 单机 PM 工作台用不上。
- 裁定:**不 vendor**。`ignore = "0.4"`(0.4.33)+ `globset` 直 depend。

### pi-ast — **不适用(v0.4 无 AST 需求)**
- 实查:4,448 行本体,但依赖 **~50 个 tree-sitter 语法 crate**(typescript/rust/python/…全列表)+ ast-grep-core + phf。vendor 它 = tree-sitter 全家桶进二进制,体积不可接受。
- Nova 5 工具没有 AST 编辑(str-replace 按裁定锁定)。LSP/DAP 已明确 v0.5+ 池外。
- 裁定:**不 vendor**。若 v0.5+ 要 AST 能力,届时按需单语法 tree-sitter,而不是 pi-ast 全家桶。

### pi-iso — **不适用(无沙箱隔离场景)**
- 实查:4,294 行,跨平台 isolation PAL(macOS clonefile / Linux overlayfs+fuse / Windows **ProjFS** / Rcopy+git worktree 兜底)。依赖 similar/tokio/libc/windows-sys。
- 用途是给子 agent 任务做写时复制沙箱。Nova spawn_subagent 是**同进程上下文隔离 + 工具白名单**(ADR-0004),无文件系统沙箱需求;Windows 主场的 ProjFS 依赖更是分发雷区。
- 裁定:**不 vendor**。沙箱若 v0.5+ 提案,另立 ADR。

### pi-edit — **不 vendor,自写 str-replace 更便宜(裁定 D-13 一致)**
- 实查:**21,193 行**,五个编辑模式引擎(replace/patch/apply_patch/hashline/sloppy)+ 流式 ArgSession + fuzzy 匹配 + EditStore。依赖 pi-ast、pi-diff、pi-walker、xutf、xxhash——**vendor pi-edit 必须连带 pi-ast(50 语法)→ 不可行**。
- 但它的**语义值得对照抄**:① `replace.rs` 的 old_string 唯一性校验 + 失败回带行号上下文(正是 D-13 锁定的 v0.4 语义);② 错误串"byte-identical to the TypeScript implementation"的纪律——**模型是在这些错误文案上训练的**,Nova 自写 edit 工具的错误消息格式应尽量贴近 omp/TS 惯例(如 "old_string not found / not unique" 措辞);③ `hashline` 模式的 stale-anchor 写前拒绝语义,v0.5 立项时协议照抄(D-13 已裁定)。
- 裁定:**不 vendor**。自写 str-replace(预计 300-500 行:read-through 文件缓存 + 唯一性匹配 + 行号上下文错误 + diff 生成),语义对照 pi-edit `replace.rs`。

### pi-natives — **不适用(N-API cdylib,架构不符)**
- 实查:45,149 行,`crate-type = ["cdylib"]`,napi 3 绑定,含 grep/diff/edit 的 napi 导出层、音频、剪贴板、PTY、崩溃钩子。Nova 是 Tauri 进程内 Rust,**不经过 Node,整 crate 无意义**。
- 但它揭示了 grep 的真实实现栈:依赖 `grep-searcher`/`grep-regex`/`grep-pcre2`(ripgrep 系 crate)。Nova 的 grep 工具应**直接 depend 这三个 crates.io crate**,这正是 ripgrep 本体用的库,无需任何 omp 代码。

### 其余(pi-shell/pi-vcs/pi-voice/pi-builtins/vendor/brush-core)
- pi-shell:uutils coreutils + brush bash 内嵌——**exec 不嵌 bash 是锁定裁定,直接不适用**。
- pi-vcs:进程内 gix + jj-lib 双 VCS 后端,重依赖;Nova v0.4 无 git 工具。不进。
- pi-voice/pi-builtins/brush-core:语音/内置命令/bash 解析,均不相关。

### 1a. TS harness 层语义参考(实查 packages/coding-agent)

loop 层确认无 Rust 可移植(D-07 修正属实)。值得 Nova 引擎对照的设计语义:

1. **审批三档 tier = `read | write | exec`**(`tools/approval.ts`,与 Nova D-12 三档风险档案几乎同构)。omp 用 `ApprovalMode`(always-ask/write/yolo)对 tier 封顶 + 用户 per-tool 覆盖(`allow|deny|prompt`)+ 覆盖来源标注(`tool|user|mode`)。Nova 已有更严格的持久化确认队列;可借鉴的是 **tier 封顶 + 会话级跳过开关**的模型(对应 pipeline C 的"可配置确认门"),而非 omp 的易失对话帧。
2. **edit 工具错误文案纪律**(见 pi-edit 裁定):错误消息即模型接口。
3. **subagent prompt 文件化**(`prompts/system/subagent-{system,user,yield-reminder}.md`):spawn_subagent 的 systemPrompt/userPrompt 模板落 manifest 数据,不是硬编码——与 Nova manifest-as-data(三次复用:persona/Skill/subagent)同路。
4. **grep 输出模式枚举**(content/files_with_matches/count,`GrepOutputMode`)+ `MAX_FILE_BYTES` 常量与 native 侧注释互指的纪律——参数 schema 两端同源单真相。

---

## 2. 前端 diff 审批卡

| 库 | 版本 | 体积 | 侧评 |
|----|------|------|------|
| **react-diff-view**(推荐) | 3.3.3(latest) | 小(hunks 渲染层,无解析无高亮捆绑) | unified hunks → React,gutter/widgets 可组合,样式全自定义 → tokens 主题(--text-success/danger 直接映射 +/-) |
| react-diff-viewer-continued | 4.4.0 | 较大,自带样式体系 | 开箱 side-by-side,但样式覆写痛苦,tokens 对齐差 |
| 自写(手排两列 span) | — | 0 | 行内小 diff 可行,行号配对/hunk 折叠/大文件虚拟化会失控 |

**推荐组合:`react-diff-view@3.3.3` + `diff@9.0.0`(jsdiff)**。
- 数据流:Rust 引擎(pi-diff 或 similar)生成 **unified diff 文本** → 经事件/确认卡 payload 到 webview → `diff.parsePatch(unifiedText)` 解析成 hunks → `react-diff-view` 渲染。
- 主题:react-diff-view 无捆绑高亮/配色,className 走 tokens(--color-success/danger);代码高亮如需,复用 Phase 31 已进 bundle 的 prismjs(不新增 refractor)。
- side-by-side vs unified:react-diff-view 由 `gutterType`/布局决定,先交付 unified(简单、PM 读得懂),side-by-side 同库后续可加,无迁移成本。

## 3. Rust 侧 diff 计算

| 库 | 版本 | 评 |
|----|------|-----|
| **similar**(推荐) | 3.2.0 | git-delta/insta 在用;自带 `UnifiedDiff` 格式化输出 + `TextDiff`/word/line 粒度;成熟、文档好、维护活跃 |
| imara-diff | 0.2.0 | 性能最优(helix 在用),但只产出 hook/算法层,**无 unified diff 格式化**,格式化要自写;Nova diff 规模(单文件审批卡)用不满它的性能 |
| vendored pi-diff | 18.1.8 摘取 | 零依赖、jsdiff 兼容;无 unified 输出需自拼(structured-patch helper 有,unified 需格式化) |

**推荐:`similar = "3.2"`**(crates.io,免 vendor 维护),`TextDiff::unified_diff()` 直出审批卡文本。omp workspace 自身也 depend similar 3.1(实查 workspace.dependencies),侧面印证。
pi-diff vendor 的唯一独占收益是"与前端 jsdiff 输出逐位一致"——但既然前端用 jsdiff **parse** Rust 的 unified 文本而非自算,一致性诉求不存在。**因此 §0 的二选一收敛为:similar 进 Cargo,pi-diff 不 vendor**。(修正 §0 速览:vendoring 最终建议 = **零 crate**。)

## 4. 5 工具 / subagent / pipeline / Skill 依赖清单

### 新增 Rust 依赖(共 4 个,全部 crates.io)

| crate | 版本 | 用途 | 为什么不能用已有的 |
|-------|------|------|--------------------|
| `similar` | 3.2 | write/edit 工具生成 unified diff → 审批卡 | std 无 diff;sha2 不是 diff |
| `ignore` | 0.4(0.4.33) | grep/read 的目录遍历 + gitignore 语义 | 现有 fs_ops 是单文件粒度,无遍历 |
| `grep-searcher` | 0.1(0.1.17) | grep 工具行搜索引擎(ripgrep 核心) | regex crate 未直接在依赖里;即算有,行搜索+匹配上下文自写不值 |
| `grep-regex` | 0.1 | grep 的 pattern 编译(ripgrep 核心) | 同上 |

(`globset` 随 ignore 传递可用;若 tools.rs 需显式 glob 再加,先不加。)

### 新增 npm 依赖(共 2 个)

| 包 | 版本 | 用途 |
|----|------|------|
| `react-diff-view` | 3.3.3 | diff 审批卡 hunks 渲染 |
| `diff` | 9.0.0 | parsePatch 解析 unified 文本 |

### 明确零新依赖的部分

| 功能 | 复用 |
|------|------|
| read/write/edit/exec/grep 工具注册与三档风险 | engine/tools.rs 既有工具注册表 + confirmations 队列,只加策略表(D-12) |
| exec 白名单 | engine/exec.rs 既有进程执行;白名单 = 配置数据,不是依赖 |
| spawn_subagent(深度 1、摘要回传) | scheduler 现有多 run + ADR-0004 manifest-as-data;子 run 是一次 engine_run 调用 |
| pipeline 编排 + 可配置确认门 | 确认门 = 工具风险标注复用;pipeline run = 单 run 多步(Phase 26 一键十八份先例);**警惕与产品哲学红线冲突——pipeline 是用户自建模板,不是刚性引擎**(PROJECT.md 约束) |
| Skill manifest + FTS5 按需加载 | knowledgeRepo FTS5 中文检索已就绪;manifest 复用 workflow_templates skill 字段(Phase 30 预留) |
| persona manifest(modelHint) | ADR-0004 manifest 形状加一个字段 |
| diff 卡代码高亮 | Phase 31 已进 bundle 的 prismjs |
| 事件 schema 扩展(persona/发起方) | event_log.rs + 双侧 parity fixture,机制既有 |

### "不要引入什么"清单

- **任何 omp crate vendor**(含 pi-diff,理由见 §3 收敛)
- tree-sitter 全家桶 / pi-ast(v0.4 无 AST)
- pi-iso / ProjFS / overlayfs(无沙箱需求)
- brush-core / pi-shell(嵌 bash 被裁定否决)
- gix / jj-lib(v0.4 无 VCS 工具)
- refractor / react-diff-viewer-continued / 自写 diff 布局(prismjs + react-diff-view 覆盖)
- difflib 类 JS 侧自算 diff(前端只 parse,不自算)
- tiktoken-rs(token 估算已有自研 token_estimate.rs)

---

## 5. 集成点(roaddmap/plan-phase 用)

1. `Cargo.toml`:+similar/ignore/grep-searcher/grep-regex 四依赖(coding 工具 phase 第一波)。
2. `src-tauri/src/engine/tools.rs`:注册 5 工具,风险档案——read/grep=读档免确认;write/edit=write 档一律 diff 审批卡;exec=exec 档白名单确认(白名单窄命令直呼系统 shell,不嵌 bash)。
3. `engine/confirmations.rs`:diff 卡 payload 携带 unified 文本(新 artifact 形态,注意 >4KB artifact 化既有规则)。
4. 前端:确认卡宿主体系(AgentConsole/工作区/文档面板三宿主先例)加第四形态 diff 卡;react-diff-view 懒加载(编辑器 chunk 已 297KB 的教训)。
5. Skill:skills 表 + manifest JSON(复用 workflow_templates 模式),FTS5 检索走 knowledgeRepo 既有 CJK 切分。
6. parity:persona 字段/spawn_subagent 事件进 agent_events schema → 双侧 fixture 同步(既有纪律)。

## Sources

- /tmp/omp-research 浅克隆(gh clone, 2026-09-04):根 Cargo.toml、crates/{pi-diff,pi-walker,pi-ast,pi-iso,pi-edit,pi-natives}/Cargo.toml 与源码、packages/coding-agent/src/tools/{approval,grep,write}.ts、packages/coding-agent/src/edit/schemas.ts
- crates.io(cargo search):similar 3.2.0 / imara-diff 0.2.0 / grep-searcher 0.1.17 / ignore 0.4.33
- npm registry(npm view):react-diff-view 3.3.3 / react-diff-viewer-continued 4.4.0 / diff 9.0.0
- 项目内:999.5-CONTEXT.md(D-05/06/07/12/13/14)、ADR-0003/0004 存在性确认、src-tauri/Cargo.toml、engine/ 24 模块清单
