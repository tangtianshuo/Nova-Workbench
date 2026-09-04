# SUMMARY — v0.4 Research Synthesis (coding Agent + spawn_subagent + pipeline + Skill)

**Synthesized:** 2026-09-04
**Inputs:** STACK-V0.4.md / FEATURES-V0.4.md / ARCHITECTURE-V0.4.md / PITFALLS-V0.4.md
**For:** v0.4 requirements 定义 + roadmapper

---

## Executive Summary

v0.4 的四块功能(coding agent / spawn_subagent / pipeline / Skill)在架构研究后全部收敛为**现有 Rust 引擎的增量扩展,零新架构机制**:coding 5 工具照 fs_ops 模式落 `code_ops.rs`,diff 审批卡 = 确认队列新 kind(`code_edit`),子 run = 独立 session + `parent_session_id`(列已存在)+ `CancellationToken::child_token()` 级联,pipeline = Phase 30 模板由编排 run 依次 spawn,Skill = workflow_templates 超集字段 + FTS5 按需加载(列已预留)。Architecture 实查推翻了两个 ADR-0004 假设:`agent_events` 无 run_id 列、调度器无父子关系——但推荐方案(独立 session 表达)反而更 lazy,投影/compaction/配对不变量零改动免费获得。

**omp 适配最终裁定(用户点名调研项,明确答案):零 crate vendoring。** 逐 crate 实查后全部否决——pi-edit 21k 行且连带 tree-sitter 全家桶、pi-natives 是 napi cdylib 架构不符、pi-diff 的一致性收益被"前端只 parse 不自算"的架构抵消。替代方案:Rust 侧 `similar` 3.2 直出 unified diff,前端 `diff@9` parsePatch + `react-diff-view@3.3.3` 渲染。新增依赖共 **4 crate(similar/ignore/grep-searcher/grep-regex,均 ripgrep 系成熟库)+ 2 npm(react-diff-view/diff)**,str-replace 自写 300-500 行(错误消息语义对照 pi-edit `replace.rs`,与 TS 惯例字节级一致——错误文案即模型接口)。

核心风险集中在 PITFALLS 的 8 个 Critical,其中 4 个必须进 success criteria:CP-1 父子调度死锁(3 并发父各 spawn 子的死锁回归测试)、CP-3 apply 前重校验(stale-anchor 等价语义,str-replace 必有)、CP-6 exec 白名单四绕过面(env 泄漏测试 + 学习粒度提二元组 + git 危险 flag 黑名单 + PATH 解析拒绝 workspace 命中)、CP-7 repo_root 显式边界(coding 工具不得读写 Nova 自身数据)。CP-4(事件种类清单先行 + fixture 同 commit + CI 互锁断言)是跨 phase 流程门,对应 RETROSPECTIVE 两次 VERIFICATION 缺失教训。

---

## Key Findings

### Stack(置信 HIGH,omp 实查 + registry 核查)

| 决策 | 结论 |
|---|---|
| omp vendoring | **零 crate**(pi-diff 的 jsdiff 一致性诉求不存在:前端 parse Rust 的 unified 文本,不自算) |
| Rust diff | `similar = "3.2"`(UnifiedDiff 直出;omp workspace 自身也 depend similar) |
| Rust 遍历/grep | `ignore 0.4` + `grep-searcher 0.1` + `grep-regex 0.1`(ripgrep 同源,即 pi-natives 揭示的真实实现栈) |
| 前端 diff 卡 | `react-diff-view 3.3.3` + `diff 9.0.0`;unified 先行,side-by-side 同库后续;高亮复用 Phase 31 prismjs;**懒加载**(297KB chunk 教训) |
| 其余三块 | 零新依赖——scheduler/confirmations/manifest-as-data/FTS5 全复用 |
| 禁入清单 | tree-sitter 全家桶、pi-iso/ProjFS、brush-core、gix、refractor、tiktoken-rs |

值得对照抄的 omp 语义:审批 tier 封顶(`read|write|exec` 三档,与 D-12 同构)、subagent prompt 文件化(manifest-as-data 同路)、grep 输出模式枚举 + 参数 schema 两端单真相。

### Features(项目内裁定 HIGH / 业界形态 MEDIUM)

- **A coding table stakes:** 5 工具 + 每文件 diff 卡(Cline 事实标准)+ exec 白名单「允许一次/总是/拒绝」+ repo 作用域锁 + 取消/进度复用。
- **Anti-features(显式不做):** hashline(v0.5)、xterm.js PTY、LSP/DAP、多 diff 批量卡、plan mode、嵌 bash、自动 git push、DAG 工作流引擎、模板强制流程、全局全自动配置。
- **B:** 双入口 persona(助手快模型/coding 强模型,manifest modelHint)+ 首批 2 专家(prd-writer 零工具依赖可先行 / prototype-builder 依赖 A);spawn 渲染为「专家卡」而非术语。
- **C:** 顺序 spawn 阶段子 run + 默认门 + 会话级跳过开关 + 门粒度三档(逐产物/阶段摘要/跳过)。
- **D 关系裁定:** Skill = 模板超集字段,**一张数据两个入口,绝不两套 DSL**;退路 = skills 表外键引用 workflow_templates,仍不复制 prompt。

### Architecture(置信 HIGH,源码实查;死锁方案 MEDIUM)

- 子 run = **独立 session_id**(`{parent}/sub/{run_id}`),`sessions.parent_session_id` 列已存在(fork 先例)——投影/compaction/check_event_stream 零改动。
- cancel 级联 = `CancellationToken::child_token()`,engine_cancel 零改动;children 映射仅审计/UI 可选。
- 确认队列加 kind(`code_edit`/`pipeline_gate`)零 schema 改动;confirmed 重放照 fs_write 的 Rust `tools::execute` 重执行先例,TS executeTool 不实现 coding 工具。
- 摘要回传 = 结构化 manifest `{summary, files_changed[], artifacts[]}`,引擎确定性收集,不信子 LLM 自述;超长才用一次 chat_no_tools 压缩。
- exec 不新建工具,扩展现有 exec.rs;coding persona 白名单追加 npm/cargo 等(不动全局 default)。
- Skill 起步不分表(workflow_templates 列已在);注入替换 `append_workflow_list` 截断名单 → name+description 清单(≤30)+ FTS5 按需全文(代码里已有 `TODO v0.4` 注释)。

### Pitfalls(Critical 8 条,按 phase 归属)

| ID | 一句话 | 必须进 success criteria? |
|---|---|---|
| CP-1 | 父 run 占 permit await 子 run → cap-3 全家死锁;子 run 不占公共 slot | **是**(3 并发父 spawn 死锁回归测试) |
| CP-2 | code_edit 新 kind hash 域 = {path, old_string, new_string},diff 不进 params | 是(同文件两次 edit → 两 token 测试) |
| CP-3 | apply 前重读文件重校验 old_string 唯一命中(stale-anchor 等价,v0.4 必有) | **是**(篡改文件 → apply Failed 测试) |
| CP-4 | 事件种类清单先行 + fixture 同 commit + CI 互锁断言 | **是**(流程门,全 phase) |
| CP-6 | exec 白名单四绕过面:kv 学习无子命令限制 / env 继承泄 key / PATH 劫持 / git 首参数限制不足 | **是**(env 无 *KEY* 测试 + 学习粒度二元组 + git flag 黑名单) |
| CP-7 | repo_root ≠ workspace_root;TOCTOU 再 resolve;Windows 大小写统一 canonicalize | **是**(junction/大小写/Nova 数据库路径三测试) |
| CP-8 | 崩溃后孤儿 exec 进程残留(Windows taskkill 不发生);恢复枚举 PID 清杀 + consumed-无-result 审计事件 | P-CODE 同 plan |
| CP-5 | 子事件永不进父流,父侧只落一对 spawn tool_call/tool_result | 是(双流 parity fixture) |

Moderate 值得注意:MP-1 确认轰炸(同 turn 变更集聚合卡 + reject 附原因)、MP-3 子确认卡带 parent 徽章、MP-6 门 TTL/重启续跑、MP-7 跳过开关**不可旁路 exec/diff 审批**(写进 ADR)、MP-8 skill 沉淀必须全文人工确认(注入持久化通道)、MP-10 grep/read 服务端限流 + 分页。

---

## Implications for Roadmap

**Build order(ARCHITECTURE 建议,PITFALLS 排序一致):A → B → C,D 独立可穿插。B 的引擎机制与 A 无耦合,存在并行窗口。**

### 建议 4 phase(granularity coarse 符合用户约束;压缩到 3 则 B 并入 C)

| Phase | 内容 | 理由 | 交付 | 必避 pitfalls |
|---|---|---|---|---|
| **P1 — coding 工具地基(P-CODE)** | code_ops 5 工具 + code_edit diff 卡 + repo_root 绑定(git 检测)+ exec 白名单收口与 persona 扩展 + 前端 diff 卡(第四宿主) | 一切的地基(prototype-builder 与 pipeline 都要跑 edit/exec);最早用户价值(狗粮即用) | agent 能在真实仓库干活,每文件 diff 审批 | CP-2/3/6/7/8 + MP-1/10/11 |
| **P2 — spawn_subagent 引擎机制(P-SUB)** | 子 run 生命周期(child_token + 独立 session + await/permit 让位)+ 结构化摘要回传 + manifest 存储(三处同形字段一次定)+ prd-writer 端到端 | 引擎机制与 A 无耦合可并行;prd-writer 零工具依赖即可验证 spawn 链路 | 专家子 run 全链路 + prd-writer 可用 | CP-1/4/5 + MP-2/3/4/5 |
| **P3 — persona 双入口 + prototype-builder + pipeline(P-PIPE)** | coding persona(modelHint)+ prototype-builder(白名单=5 coding 工具)+ pipeline_gate + 会话级跳过 + 断点续跑 + 门粒度三档 | 依赖 A+B 的产品形态层;三档门可后置到本 phase 收口 | 双入口 + PRD→原型一句话跨 persona + 编排 run | MP-6/7 + Mi-4(哲学红线 VERIFICATION 检查项) |
| **P4 — Skill(P-SKILL)** | FTS5 按需加载(替换截断名单)+ skill_search + 沉淀入口扩展 + skill_injected 审计 | 只碰 prompt 注入与一张表,与 A/B 并行无冲突;排最后收口或穿插 | agent 自主检索加载用户流程;沉淀链闭环 | MP-8/9 |

**每个 phase 首个 plan 必含:** 事件 schema 增量文档 + 双侧 parity fixture 同 commit(CP-4 流程门,CI 互锁断言一次建成,后续 phase 继承)。

### Research flags(需 /gsd:research-phase)

| Phase | 深研点 | 置信 |
|---|---|---|
| P2 | cap-3 死锁方案二选一(permit 让位 vs 子免调度);子 run 在 tray 的展示形态 | MEDIUM |
| P1 | Windows 无 shell 调 npm(.cmd/.bat,exec.rs normalize 只剥 .exe) | MEDIUM |
| P3 | 门过期 UX;会话级跳过的存储粒度 | MEDIUM |
| P4 | workflow_templates 字段上限(何时分表) | HIGH(先合后分无返工风险) |

标准模式可直接 plan:diff 卡确认管线(fs_write 先例)、confirmed 重放、FTS5 检索、沉淀链(Phase 30 先例)。

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack | **HIGH** | omp 浅克隆实查 + crates.io/npm 版本核查;vendoring 裁定逐 crate 有据 |
| Features | **HIGH**(裁定)/ MEDIUM(业界形态) | 项目内 D-01..14/ADR-0004 锁定;Cline/Claude Code 形态来自训练数据(UX 模式多年稳定) |
| Architecture | **HIGH**(集成点)/ MEDIUM(死锁方案) | 全部集成点源码实查;cap-3 死锁两方案均局部改动,留 P2 立项裁定 |
| Pitfalls | **HIGH** | 系统特定结论均代码实查(exec.rs/scheduler.rs/confirmations.rs);外部生态项已标注 |

**Gaps(需 requirements/planning 阶段闭合):**
1. 死锁方案二选一未裁定(P2 首个 plan 前必须定,带回归测试)
2. manifest 存储 kv vs 新表未定(与 Skill 同一定,三处同形字段名一次定)
3. migration 0015 是否需要(独立 session 方案下大概率不需要,若要 run 维度审计则要)
4. CP-8 恢复清杀 PID 的跨平台范围(Windows 主场先做的边界)

---

## Sources

- 研究输入:`.planning/research/{STACK,FEATURES,ARCHITECTURE,PITFALLS}-V0.4.md`(2026-09-04)
- 实查:/tmp/omp-research 浅克隆(pi-* crate 源码 + packages/coding-agent);src-tauri/src/engine/ 8 个模块;crates.io / npm registry
- 项目裁定:999.5-CONTEXT(D-01..14)、ADR-0004、Phase 30 CONTEXT(30-D-01..09)、PROJECT.md v0.4 里程碑定义、RETROSPECTIVE.md
