---
status: complete
phase: 22-loop-replay-parity
source: [22-05-SUMMARY.md, 22-06-SUMMARY.md, 22-VERIFICATION.md]
started: 2026-08-28T00:00:00Z
updated: 2026-08-31T01:09:30Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: 完全杀掉 Nova 进程(含托盘)后重启。启动无报错无白屏,session 列表正常加载,历史 session 消息完整可读。
result: pass

### 2. ChatPanel 对话走 Rust 引擎(修复后复测)
expected: 在 ChatPanel 发一条普通消息(如"帮我总结一下当前产品"),流式响应逐字出现;run 正常完成 — 无英文 "[tool loop reached...]" marker;打满预算时以中文收尾句完成。run 完成后消息持久化,切走再切回 session 内容不丢。
result: pass
note: 修复后复测通过(2026-08-30;此前 blocker:knowledge_write 空参数循环 + 5 轮终死)

### 3. CmdK 发起对话走引擎
expected: CmdK palette 发起一个 run,行为与 ChatPanel 一致:流式输出、正常完成、session 中可见。
result: pass

### 4. knowledge_search 只读检索(修复后复测)
expected: 让 agent 检索知识库(如"搜一下知识库里关于竞品的文章"),agent 1-2 次 knowledge_search 后停止检索并总结作答(prompt 新增检索预算规则);run 正常完成,无确认卡片打断,无英文 marker 异常终止。
result: issue
reported: "似乎是使用llama3.2 1b 模型导致的问题。当使用deepseek的时候 没出现这个问题"
severity: minor
note: DeepSeek(主供应商)下通过;llama3.2 1b(Ollama 本地小模型)仍过度检索 — 疑似模型能力限制(prompt 预算规则对 1B 模型无效),待确认结构兜底是否生效(是否以中文收尾正常完成而非异常终止)

### 5. knowledge_write / memory_write HITL 确认(修复后复测)
expected: 触发需确认的写入工具(如让 agent 把某条内容写入知识库,不必提供 productId — 引擎已用 ctx 兜底),出现带「确认/拒绝」按钮的 HITL 确认卡片;点「确认」→ 工具重新执行且结果落库;点「拒绝」→ 走取消路径,无孤儿事件。
result: issue
reported: "写入知识库失败 Tool \"writeKnowledgeArticle\" arg validation failed: [{\"code\":\"invalid_value\",\"values\":[\"架构设计\",\"领域字典\",\"技术协议\",\"FAQ与排障\",\"最佳实践\",\"经验沉淀\",\"业务规则\",\"架构约束\",\"踩坑指南\"],\"path\":[\"category\"],\"message\":\"Invalid option: expected one of ...\"}]"
severity: major
note: 原根因(productId 无 ctx 兜底 → 卡片不出现)已修复 — 卡片正常出现且确认后进入重放;断点后移:确认重放走 TS writeKnowledgeArticle zod 严格枚举,而 Rust schema(tools.rs:101)category 为裸 string 无枚举 — 跨边界校验不对称

### 6. 中断恢复(重启后 session 恢复)
expected: 在一个 run 进行中(或工具待确认时)强杀 app,重启后该 session 恢复;被中断的 tool_call 显示为 unknown/中断状态,不重复执行,可在 UI 正常续跑或取消。
result: pass

### 7. Test 5 复测:knowledge_write HITL 确认全链路(22-09 修复后)
expected: 选定产品后让 agent 写知识文章;category 非法时卡片出现前 arg_error(模型自纠);卡片 → 确认 → 落库成功(无 zod invalid_value);拒绝 → 无孤儿事件。
result: issue
reported: "写入依旧失败 点击确认后，出现toast: 写入知识库失败 Knowledge write arguments do not match the confirmed candidate."
severity: major
note: 22-09 的 category 枚举修复生效(zod 不再报 invalid_value);断点再次后移:Rust 候选 params_hash 域(effective_args=原始模型args+productId/category/tags 注入)≠ TS consume 重算域(knowledgeParams(resolveDraft)=10字段规整 draft,含 operation/summary/author/readTime 默认填充)— 结构性必然 params_mismatch,详见 Gaps

### 8. Test 4 复测:knowledge_search 弱模型优雅收尾(llama3.2 1b,可选)
expected: llama3.2 1b 下让 agent 检索知识库;允许过度检索,但 run 必须以中文优雅收尾(outcome=completed/tool_limit,无英文 marker 异常终止)。
result: skipped
reason: 用户决定延后修复(2026-08-31;22-09 已定性为 known capability limitation — DB 证据 outcome=completed,结构兜底生效,仅多余检索;转 todo 跟踪)

## Summary

total: 8
passed: 4
issues: 3
pending: 0
skipped: 1
blocked: 0

## Gaps

- truth: "knowledge_write 确认后重放成功落库:卡片出现 → 确认 → 结果写入(22-09 后复测)"
  status: failed
  reason: "User reported: 写入依旧失败 点击确认后，出现toast: 写入知识库失败 Knowledge write arguments do not match the confirmed candidate."
  severity: major
  test: 7
  root_cause: "确认链 hash 域跨边界不对称(与 productId 缺兜底、category 枚举缺失同类的第三处):①Rust execute_knowledge_write(tools.rs:427-433)create_candidate 的 params_json = effective_args = 原始模型 args 克隆 + 仅注入 productId/category/tags — 通常缺 operation/summary/author/readTime 字段;params_hash = params_hash(effective_args)。②确认后 TS 重放(chatConsoleStore.ts:941 executeTool → knowledgeWrite.ts:128 resolveDraft → confirmations.ts:189 consumeKnowledgeWriteConfirmation)重算 hash = computeParamsHash(knowledgeParams(resolveDraft(args)))(confirmations.ts:65-78)= 恒定 10 字段规整 draft:operation 按 itemId 重算('created')、summary=args.summary??content.slice(0,100)、author=args.author??'AI 助手'、readTime=args.readTime??'待阅读'。③两侧哈希对象键集与值域结构性不相交 → 每次确认必 params_mismatch(confirmations.ts:131),非时序/数据问题。旧 TS 引擎时代候选创建与消费同在 TS、hash 域同构,故从未暴露;22-06 把创建移到 Rust 后接缝两侧从未对齐 params 形状"
  artifacts:
    - path: "src-tauri/src/engine/tools.rs"
      issue: "execute_knowledge_write(:427-432)effective_args 仅注入 productId/category/tags,未规整为 TS knowledgeParams 的 10 字段 draft 形状(operation/summary/author/readTime 默认值缺失)→ 候选 params_hash 域与 TS consume 重算域不一致"
    - path: "src/ai/tools/knowledgeWrite.ts"
      issue: "resolveDraft(:48-78)在 consume 侧补默认值(content.slice(0,100)/'AI 助手'/'待阅读')+ 重算 operation — 这些默认值不参与 Rust 侧 hash"
    - path: "src/ai/confirmations.ts"
      issue: "consumeKnowledgeWriteConfirmation(:185-199)以 TS 侧重算 draft 的 hash 调 store.consume(token, hash) 与 Rust 存的 params_hash 比对(:131 报 params_mismatch)"
    - path: "src/stores/chatConsoleStore.ts"
      issue: "confirmKnowledgeWrite(:933-985)确认后重放只传 pendingConfirmation 投影字段;若投影缺 summary/author/readTime 默认值,resolveDraft 会再补一轮与 Rust 不同的默认"
  missing:
    - "Rust execute_knowledge_write 把 effective_args 规整为与 TS knowledgeParams(resolveDraft) 逐字段同构的 10 字段形状:productId、itemId(仅模型提供时)、operation(按 Rust 侧知识表存在性:有则 updated 无则 created)、title、category、tags(默认 [])、content、summary(args.summary ?? content 前 100 字)、author(args.author ?? 'AI 助手')、readTime(args.readTime ?? '待阅读');create_candidate 的 params_hash 与卡片 candidate.args 同源此对象(operation 字段不进 zod 重放参数 — chatConsoleStore.ts:941 只挑选已知字段,不受 .strict() 影响)"
    - "跨边界 hash 平价测试:Rust 单测断言 params_hash(规整后 effective_args) == TS computeParamsHash(knowledgeParams(resolveDraft(同输入))) 的已知常量(参照 commands.rs:1099 memory 先例),锁 create-path;update-path(itemId 存在)若 webview rndStore 与 Rust 表不一致仍可能漂移,列为已知边界记录于测试注释"
    - "JS slice(0,100) 是 UTF-16 单位、Rust chars().take(100) 是 Unicode 标量 — BMP(中文)一致,emoji 代理对有差异;截断逻辑加 ponytail 注释标明天花板"
  artifacts_pending_verify: []
  debug_session: null

- truth: "knowledge_write 确认后重放成功落库:卡片出现 → 确认 → 结果写入"
  status: resolved
  reason: "User reported: 写入知识库失败 Tool \"writeKnowledgeArticle\" arg validation failed: [{code:invalid_value, path:[category], message:Invalid option: expected one of 架构设计|领域字典|技术协议|FAQ与排障|最佳实践|经验沉淀|业务规则|架构约束|踩坑指南}]"
  severity: major
  test: 5
  root_cause: "跨边界校验不对称(与原 productId 缺兜底同类):①Rust knowledge_write schema(tools.rs:101)category 为 {\"type\":\"string\"} 无枚举,execute_knowledge_write 也不校验 category 合法性 → 模型按宽松 schema 选值(如"介绍"类自由文本)→ 候选创建成功、卡片正常出现;②确认后重放走 TS registry executeTool('writeKnowledgeArticle')(CLAUDE.md:TS registry 服务 post-confirmation replay),knowledgeWrite.ts:28 z.enum(9 个固定 category)严格校验 → invalid_value 拒绝 → 写入失败。原 22-08 修复(productId ctx 兜底)本身工作正常,断点后移到 category 字段"
  artifacts:
    - path: "src-tauri/src/engine/tools.rs"
      issue: "knowledge_write schema(:101)category 无 enum;execute_knowledge_write 候选创建前无 category 合法性校验 — 模型可见约束与重放约束不一致"
    - path: "src/ai/tools/knowledgeWrite.ts"
      issue: "writeKnowledgeArticleSchema(:21-33)category z.enum(9 值)严格;productId z.string().min(1)(与 Rust effective_args 注入兼容)"
  missing:
    - "Rust knowledge_write schema 的 category 加 enum: [\"架构设计\",\"领域字典\",\"技术协议\",\"FAQ与排障\",\"最佳实践\",\"经验沉淀\",\"业务规则\",\"架构约束\",\"踩坑指南\"](与 knowledgeWrite.ts knowledgeCategories 单源对齐 — 注意 Rust 侧需硬编码或从共享常量同步,目前无跨语言单源机制)"
    - "execute_knowledge_write 在 create_candidate 前校验 category ∈ 枚举,非法值 arg_error(模型在卡片出现前就知道错,而非确认后失败)"
    - "回归测试:非法 category → Failed{arg_error:true} 无 candidate;合法 category → 卡片 → 确认 → 重放全链路"
  resolved_note: "2026-08-30 22-09 gap closure:tools.rs KNOWLEDGE_CATEGORIES 9 值枚举(schema :101 + 常量 :333)+ 候选创建前 arg_error 校验(:404)+ tags 默认注入(:431);TS zod 未动(仅 PAIRED 同步注释)。3 个新测试锁定;人工复测非阻塞(见 22-VERIFICATION.md human_verification)"

- truth: "knowledge_search 只读检索在弱本地模型(llama3.2 1b)下也应受预算约束优雅完成"
  status: resolved
  reason: "User reported: 似乎是使用llama3.2 1b 模型导致的问题。当使用deepseek的时候 没出现这个问题"
  severity: minor
  test: 4
  artifacts: []
  missing: []
  note: 修复后复测新发现 — DeepSeek 下通过;1B 小模型疑似无法遵循 prompt 级检索预算规则(模型能力限制,非引擎缺陷候选)。诊断要点:① llama3.2 1b 那次 run 的终态(outcome/truncated/收尾文案 — 结构兜底 MAX=8+中文收尾是否生效);② 若兜底生效仅多余检索 → 判定 non-code(capability limit),记录为已知限制;若仍异常终止 → 引擎缺陷
  resolved_note: "2026-08-30 22-09 gap closure:终态核实 = known capability limitation(non-code)—— DB 证据 session fc154236(1b,4 次过度检索)以 outcome=completed 正常结束;结构兜底(max_iterations_forces_wrapup_turn)断言完整零代码改动;结论记录于 STATE.md:134"

- truth: "ChatPanel 普通消息 run 正常完成:流式输出、消息持久化、session 内容不丢"
  status: resolved
  reason: "User reported: knowledge_search 失败 → 重试已完成 ×2 → knowledge_write 失败 ×2 → [tool loop reached the 5-iteration limit],run 未正常完成"
  severity: blocker
  test: 2
  root_cause: "三层复合:①knowledge_write 必填 productId 但无 ctx.product_id 兜底,模型传 \"\"/null → arg_error 循环(session 85f505a7 seq6-15:5 轮中 3 次空参数、2 次 productId 缺失);②ROLE_AND_TOOL_RULES(loop_runner.rs:94)无搜索终止约束,assistant 工具轮投影为 [requesting tools]、tool_result 以 user 文本回传(:249),模型无自我轨迹而重复检索;③MAX_ITERATIONS=5(:398-420)按 LLM 轮计数且含 arg_error 轮,打满即终死(truncated=true, outcome=tool_limit),无最后一轮无工具收尾路径"
  artifacts:
    - path: "src-tauri/src/engine/loop_runner.rs"
      issue: "MAX_ITERATIONS=5 无收尾路径(:26,:398-420);系统提示无终止约束(:94);Tool→User 轨迹剥离(:249)"
    - path: "src-tauri/src/engine/tools.rs"
      issue: "knowledge_write 必填 productId 无 ctx 兜底、无『勿重试』语义(:385-411);str_arg 空串 arg_error(:331)"
  missing:
    - "knowledge_write 的 productId 解析改为 str_arg(...).or(ctx.product_id),两者皆空才报错(对齐 memory_write :421)"
    - "系统提示加工具预算/终止约束(如 knowledge_search ≤3 次后必须作答)"
    - "iteration==MAX 最后一轮以 tool_choice=none 强制收尾替代终死"
    - "评估按 tool_calls_executed 计数而非 LLM 轮数"
  debug_session: .planning/debug/chat-run-tool-loop.md

- truth: "knowledge_search 只读检索直接返回结果,run 正常完成,无确认卡片打断"
  status: resolved
  reason: "User reported: agent 输出『继续用更多关键词搜索,确保覆盖全部文章。』随后 [tool loop reached the 5-iteration limit],run 异常终止"
  severity: major
  test: 4
  root_cause: "工具与数据均健康(session 50597f85:14 次 knowledge_search 全部 ok 且 matches 非空)。根因:①ROLE_AND_TOOL_RULES(loop_runner.rs:94)无停止条件,模型制定无限检索计划(每轮 3 个并行 search 枚举全部 11 篇文章);②MAX_ITERATIONS=5 按每轮 LLM 交互计数,5 轮即截断(turn_ended iterations=5, toolCallsExecuted=14);③上限终态本身优雅(assistant_message+outcome=tool_limit+truncated)但英文 marker 拼在中文句中,被感知为崩溃。与 Test 2 触发不同、放大机制相同(共用 5 轮预算)"
  artifacts:
    - path: "src-tauri/src/engine/loop_runner.rs"
      issue: "MAX_ITERATIONS=5 计数所有轮次含 arg_error(:26);提示词无工具使用停止规则(L94);limit 提示文案(L399)"
    - path: "src-tauri/src/engine/tools.rs"
      issue: "str_arg 空串参数 arg_error 放大了 Test 2 的预算消耗(:331)"
  missing:
    - "系统提示加搜索预算与停止规则(『1-2 次搜索后停止并总结,勿穷尽知识库』)"
    - "上调 MAX_ITERATIONS 或按已执行 tool_calls 计数/不计 arg_error 轮"
    - "limit 终态文案改为中文明确『已达工具循环上限,可继续提问』"
  debug_session: .planning/debug/knowledge-search-loop.md

- truth: "HITL 确认卡片带「确认/拒绝」按钮;确认→重执行落库,拒绝→取消路径无孤儿事件"
  status: resolved
  reason: "User reported: 卡片无确认或拒绝按钮,也无选项按钮。只是提到了需要确认,输入数字键进行选择。"
  severity: major
  test: 5
  root_cause: "确认卡片从未发出,不是渲染失败。execute_knowledge_write(tools.rs:385-393)要求模型自给 productId 非空,无 ctx.product_id 兜底(execute_memory_write :421 有兜底,不对称);模型不知 productId(schema 无 enum/default/提示)→传 \"\" 再传 null→两次均在 create_candidate 之前被参数验证拒绝(session 85f505a7 seq12-15,arg_error, retryAvailable:false)。无 candidate→无 Confirmation 事件→无 pendingConfirmation→卡片不渲染。『需要确认,输入数字键进行选择』是 LLM 在工具失败后自己编造的文本(src/ 无此字符串)"
  artifacts:
    - path: "src-tauri/src/engine/tools.rs"
      issue: "knowledge_write 参数验证块(:385-393)缺少 ctx.product_id 兜底,与 memory_write(:421)不对称;工具 schema(:94-111)未告知模型可用 productId"
  missing:
    - "execute_knowledge_write 中 productId 解析改为 str_arg(...).or(ctx.product_id),两者皆空才报错"
    - "可选:丰富工具描述/core context,让模型知晓当前产品 ID"
  debug_session: .planning/debug/hitl-card-no-buttons.md
