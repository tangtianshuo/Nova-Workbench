# Domain Pitfalls

**Domain:** v0.3.3 产研半落地 + 工作区入驻(文档摄取 pipeline + 多入口 AI 触发,加在既有 Rust run engine 工作台上)
**Researched:** 2026-08-31
**Confidence:** HIGH(代码/架构 pitfalls 基于本仓库实际读码与 v0.3.0–v0.3.2 审计记录;Rust 提取 crate 生态为 MEDIUM,来源见文末)

Scope note: this replaces the v0.3.1 pitfalls file (that milestone shipped). Phase mapping uses working names: **P-A** mock 全清(数据落点裁定 + 接引擎)、**P-B** tab 接 run(调度 + 投影)、**P-C** 999.1 摄取编排 + 反向创建。Adjust to final phase numbering.

---

## Critical Pitfalls

### Pitfall 1: 扫描版 PDF / 无文本层文档被静默摄取为空内容
**What goes wrong:** `pdf-extract`/`lopdf` 对扫描 PDF(纯图像页)返回空字符串或极少字符,摄取 pipeline 不报错照常建 knowledge_doc,FTS 里出现一条"存在但永远搜不到"的死文档;用户以为入驻成功。
**Why it happens:** Rust 侧零 sidecar 排除了 OCR 常规路径(Tesseract 绑定属外部依赖),团队倾向"先跑通文本层 PDF";而 PM 的真实工作区里扫描件、微信导出图片 PDF 占比不低。
**Consequences:** 999.1 的核心价值主张(从工作区入驻)对一大批真实文档失效,且失效是无声的——没有错误,只有空检索。
**Prevention:** 摄取结果带 `extraction_status` 三态(`ok / partial / no_text_layer`)+ 字符数阈值(<N 字符判 no_text_layer)。no_text_layer 文档:入库但显式标注"无文本层,未索引",UI 徽章提示,不进 FTS。OCR 明确划出 v0.3.3 边界(记入 Out of Scope,防 scope creep)。
**Detection:** 摄取完成后抽检 FTS 命中;`extraction_status != ok` 比例统计。
**Phase:** P-C 摄取(第一天就定三态,不要事后补)。

### Pitfall 2: 摄取幂等失效 —— 重扫同文件夹产生重复文档 + FTS 竞态
**What goes wrong:** 用户对同一工作区反复点"扫描":(a) 同一文件每次生成新 docId → knowledge_docs 与 FTS 里翻倍;(b) 摄取 run 与用户同时在 MDXEditor 编辑/落槽同一文档 → 版本链错乱或 FTS 索引指向已 supersede 版本。
**Why it happens:** 文件路径不是稳定身份(文件会移动/改名);`Date.now()` 风格 id 习惯(见现有 mock `req-${productId}-${Date.now()}`);event_log 唯一写者原则只覆盖 agent_* 表,摄取若另开写路径容易绕过。
**Consequences:** 第二大脑被重复数据污染,检索结果一半是冗余版本;重扫从"刷新"变成"破坏"。
**Prevention:** 内容寻址身份:`docId = hash(源文件内容 + normalized 路径)` 双键;重扫 = diff(新增/变更/删除)而非全量重建;摄取写入统一走既有 event_log/knowledge_write 工具路径,复用 v0.3.2 已闭合的 params_hash 去重语义;FTS 重建与 doc 写入同事务/同写锁(Phase 15 已有版本链 + FTS 模式,照搬)。
**Detection:** 重扫两次后 doc 数应不变(写进测试);FTS 查询命中 supersedes 的旧版本 = bug。
**Phase:** P-C;幂等测试与摄取功能同 plan 交付。

### Pitfall 3: 批量 HITL 确认疲劳 —— 摄取编排一次倒出几十张确认卡
**What goes wrong:** 扫描→分类→抽取任务/日程草稿→批量 HITL,若每个抽取物一张卡,100 份文档 × 每份 3 草稿 = 300 张卡,用户无脑全接受或直接放弃;确认流从"关键节点 HITL"退化为"点 300 次确定"。
**Why it happens:** 现有确认队列是单卡语义(Phase 14/16),直接复用不会自动获得批语义;v0.3.0 记忆防轰炸三项是记忆域的,不覆盖摄取域。
**Consequences:** HITL 价值主张被稀释;无脑全接受会把 LLM 幻觉草稿直接灌进 taskStore/scheduleStore,清理成本高于手录。
**Prevention:** 文档级聚合卡(一份文档一张卡,内嵌抽取物复选,默认全不选 = opt-in 而非 opt-out);每项"接受/跳过/编辑后接受"三态;高置信度批量动作走"一次确认整批"门。部分接受语义:被跳过的抽取物落 `skipped` 审计事件,可事后找回,不静默丢弃。
**Detection:** UAT 中用户对 >10 文档批次的操作时长;跳过项可找回。
**Phase:** P-C(UAT 必含 ≥20 文档批次场景)。

### Pitfall 4: cap-3 FIFO 调度下 tab 触发 run 饿死 chat run
**What goes wrong:** 各产研 tab AI 按钮 + 一键十八份批量生成 + 摄取编排 run 全进同一个 VecDeque FIFO;用户在三个 tab 各点一次生成,再去 chat 问一句话——排队第 4。托盘常驻意味着用户可能根本没意识到在等。
**Why it happens:** 调度器是纯 FIFO 无优先级(v0.3.2 设计如此,当时入口只有 chat);v0.3.3 新增入口数量翻倍以上,原假设失效。
**Consequences:** chat(交互式、用户正盯着)被后台批量 run 阻塞数分钟,体感"AI 卡死";或用户反复点按钮堆积更多 run。
**Prevention:** 最小改动:交互 run 优先级高于批量 tab run(两条队列);或批量生成合并为单 run 内多步(一键十八份 = 一个 run 循环,不是十八个 run,同时省上下文)。tab 内嵌进度投影必须显示队列位置/排队状态,不只是 running;run 进行中同 tab 按钮置 disabled。
**Detection:** UAT:3 个 tab run 进行中发 chat,应在下一个空 slot 执行而非队尾;按钮连点不产生重复 run。
**Phase:** P-B(调度策略与 tab 接线同 plan,不能后补)。

### Pitfall 5: mock→real 迁移的数据形状漂移 —— kv JSON 快照与 knowledge_docs 双真相源
**What goes wrong:** 现有 mock 直接 `set()` 进 rndStore(requirements/prototypes/deliverables 按 `Record<productId, ...>` 存 Zustand persist → kv_store JSON 快照)。接引擎后若生成结果落 knowledge_docs 版本化卡槽(Phase 16 模式),同一份"交付物"存在两处:kv 快照里的 UI 数据 + knowledge_docs 里的文档真相源,两边各自演化。
**Why it happens:** "接线只做一遍"(D-04)容易理解成只换数据来源不换数据落点;而 Phase 16 模式恰恰要求落 knowledge_docs;RND-ROLLOUT 也写了"业务数据关系化留 v0.3.3"。
**Consequences:** 编辑走 kv、AI 走 knowledge_docs,版本链和 AI 溯源徽章对不上;重启后两源顺序不定,UI 闪烁或回退;rewrite 级返工。
**Prevention:** 立项时裁定单一真相源(建议:文档类交付物真相源 = knowledge_docs,kv 字段退化为投影缓存或删除);写字段映射表(mock 产物字段 → knowledge_docs slot/category);迁移 = 一次性 kv→docs 回填 + 旧字段弃用,不留并行读写期。结构化字段(如 `Requirement.businessGoal`)要么序列化进 doc payload,要么显式降为投影派生。
**Detection:** 同一交付物在两源同时可写 = 架构违规;replay 后 UI 数据与 docs 内容不一致 = bug。
**Phase:** P-A 第一个 plan(裁定先于接线)。

### Pitfall 6: 新事件类型破坏 replay-parity 纪律
**What goes wrong:** 摄取编排、tab run、批量确认引入新 event kind(如 `ingest_*`、`batch_confirmed`),若 Rust 单侧新增而 TS 投影侧不认识,或 payload 塞非确定性字段(时间戳、UUID、浮点),双边 fixture parity 测试从"逐位锁定"退化为"静默跳过未知事件"。
**Why it happens:** 赶工期最常见的捷径是"新事件 Rust 先记着,投影后面补";而 v0.3.2 的核心资产就是 parity 锁定。
**Consequences:** 累积几个版本后 parity 测试名存实亡,引擎与投影静默分叉——正是 v0.3.2 花三轮 gap-closure 才闭合的那类 bug(params_hash 域对齐)重演。
**Prevention:** 纪律规则化:新 event kind 必须 (1) 同 plan 内双侧定义 + fixture,(2) payload 只含确定性字段(时间戳走事件列),(3) 投影对未知事件 fail-loud 不静默跳过。收口 gate:每个新 kind 至少一条真实日志 fixture。
**Detection:** 出现没有 fixture 样本的新 event kind;投影代码出现 `default: /* ignore */`。
**Phase:** P-A 首次引入新 kind 时立规;全里程碑收口 gate。

---

## Moderate Pitfalls

### Pitfall 7: 摄取 run 与 tab run 上下文混淆
多入口 run 共享 context_assembler 五段注入,但那是 chat 语义(记忆/知识/产品恒注入);批量摄取 run 每份文档都带全套上下文 → token 爆炸 + 分类被无关记忆污染。tab run 不带 tab 上下文则"原型 tab 生成出需求文档风格"。**Prevention:** run 入口带 `context_profile`(`chat_full / tab_scoped / ingest_minimal`);tab run 显式注入 tab 类型 + 选中产品;摄取分类 run 只带指令 + 单文档内容。**Phase:** P-B 定枚举,P-C 复用。

### Pitfall 8: 巨型/畸形文档拖垮 run 与常驻引擎
200 页 PDF 全文塞单次 LLM 调用(超窗/贵/慢);畸形 OOXML(zip 炸弹、损坏 XML)让提取 panic——引擎是托盘常驻进程,一个 run 的 panic 不该带崩主循环。**Prevention:** 字符上限 + 截断标注(大文件分块记 tech debt);提取全部错误化、run 任务内 `catch_unwind`;docx 选能容忍畸形文件的方案(zip + quick-xml 自写或 docx-lite 类,勿用 bug 多的 docx-rs)。**Phase:** P-C。

### Pitfall 9: tab 进度投影把事件流当日志列表渲染
直接流式渲染全部 agent_events,批量十八份时变成每秒几十条滚动噪音;切 tab 回来要的是状态摘要不是全量回放。**Prevention:** 投影分层(run 级状态 + 当前步骤摘要 + 可展开详情);回来用 projection 重建(同构复用 ChatSession.fromEvents 模式)。**Phase:** P-B。

### Pitfall 10: "从工作区反向创建产品" 绕过事件日志
反向创建是多步写操作(建 product + 关联文档 + 可能建任务),若在前端直接调多个 store action,则绕开 engine 的审计/可恢复语义,退回 v0.3.2 刚消灭的裸 CRUD。**Prevention:** 走 run 或至少事务化 Rust command + 审计事件;与 P-A 的写路径裁定一致。**Phase:** P-C。

---

## Minor Pitfalls

### Pitfall 11: 编码与 CJK 细节
docx 中文正常(OOXML 是 UTF-8),但 PDF 的 CJK 字体可能无 ToUnicode 映射 → 提取乱码或空;旧 .doc(非 OOXML)要显式报"不支持格式"而非静默跳过。检测:提取结果 CJK 比例 vs 文件名/元数据启发式,异常标 `partial`。

### Pitfall 12: mock 清理不彻底留下 fabricate 兜底
`generate*AI` 删除后,`getPrototypeForProduct` 等 getter 的"不存在则现场编造"兜底(rndStore.ts:265-290)会让 UI 看似有数据,掩盖接线遗漏。清 mock 时把 fabricate 分支一起删,空态显式渲染。

### Pitfall 13: `runProductSkill` 半清理
对齐引擎时只换实现不换返回形状(`{ success, timestamp }` 假异步),调用方按旧形状写,真实失败路径从未被处理。接线时同步审计调用方错误分支。

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| P-A mock 全清 | P5 双真相源、P6 事件立规、P12/13 半清理 | 先裁定数据落点与事件纪律,再动代码 |
| P-B tab 接 run | P4 调度饿死、P7 上下文 profile、P9 投影噪音 | 调度优先级与接线同 plan |
| P-C 999.1 摄取 | P1 无文本层、P2 幂等、P3 批量 HITL、P8 大文件、P10 绕日志 | extraction_status 三态 + 内容寻址 id 第一天就定 |
| 收口 | P6 parity 退化 | gate 含:每个新 event kind 有双侧 fixture |

## Sources

- 本仓库:`src/stores/rndStore.ts`(mock 点位与 fabricate 兜底)、`.planning/PROJECT.md`(v0.3.0–v0.3.2 审计、调度器/HITL/parity 语义)、`.planning/research/RND-ROLLOUT-V0.3-V0.4.md`(D-01..D-08)— HIGH
- [pdf-extract (jrmuizel)](https://github.com/jrmuizel/pdf-extract) / [docs.rs/pdf-extract](https://docs.rs/pdf-extract) / [Rust forum: pdf to txt](https://users.rust-lang.org/t/convert-pdf-file-to-txt-file/56664) — 扫描 PDF 无文本层需 OCR,纯 Rust 提取不可靠 — MEDIUM
- [docx-lite (crates.io)](https://crates.io/crates/docx-lite) — zip + quick-xml、容忍畸形 DOCX — MEDIUM(单一来源,选型时需 PoC)
- [docx-rs](https://github.com/bokuweb/docx-rs) + [Reddit 反馈](https://www.reddit.com/r/rust/comments/1lqlgb7/best_rust_library_to_create_docx_file/) — 读写均有 bug 报告,不建议作摄取依赖 — MEDIUM
