# EVENT-SCHEMA-V0.4 — v0.4 事件 schema 增量清单

> CP-4 流程门(32-01):v0.4 全部新事件/payload 增量点一次建成。后续 plan(32-02..05、
> Phase 33/34/35)新增事件种类前必须先在本清单登记,并补 parity fixture。
>
> 互锁:`src-tauri/src/engine/parity.rs` 的 `event_schema_fixture_interlock` 测试解析本文件
> `- event:` 条目;`fixture: yes` 的条目名必须出现在 `src/ai/__tests__/fixtures/` 至少一个
> JSON 中(双侧单源,TS 侧 `parity.rust.test.ts` 同读该目录)。尚未落地的条目标
> `fixture: pending-<plan>`,断言跳过 —— 落地该 plan 时必须翻成 `yes` 并补 fixture。

## 增量条目

- event: code_edit — 落点 agent_events(tool_call/tool_result 配对)— 消费: Rust 引擎(event_log 写入)+ TS 投影(ChatSession code_edit 卡片)— fixture: pending-32-03 — projection-cases.json(32-03 落地时新增 case)
- event: code_read — 落点 agent_events(tool_call/tool_result)— 消费: Rust 引擎 + TS 投影 — fixture: pending-32-03 — projection-cases.json
- event: code_grep — 落点 agent_events(tool_call/tool_result)— 消费: Rust 引擎 + TS 投影 — fixture: pending-32-03 — projection-cases.json
- event: code_write — 落点 agent_events(tool_call/tool_result)+ agent_confirmation_candidates(kind=code_edit)— 消费: Rust 引擎 + TS 投影 + HITL 确认卡 — fixture: pending-32-03 — projection-cases.json
- event: exec pid — payload 增量字段 `pid: number`(32-02 落地:spawn 成功即 json_set 进在途 exec tool_call payload,tool_result payload 亦携带;CP-8 孤儿进程清杀的审计锚点)— 消费: Rust 引擎(exec.rs)+ TS 投影(可选展示)— fixture: pending-32-04 — realdb-sample(带 pid 的 exec 配对用例)
- event: code_edit candidate kind — agent_confirmation_candidates 增量 kind `code_edit`(params = {operation, path, old_string, new_string, root})— 消费: Rust confirmations + TS HITL diff 审批卡 — fixture: pending-32-03 — projection-cases.json
- event: reject_reason — agent_confirmation_candidates 增量列 `reject_reason TEXT`(migration 0016;拒绝时记录用户理由,供取消级联审计)— 消费: Rust confirmations + TS 拒绝流 — fixture: pending-32-03 — projection-cases.json
- event: orphan_exec_killed — 新 event_type(32-02 已落地;恢复时孤儿 exec pid 清杀审计,action = killed/not-running/pid-reused-name-mismatch/kill-failed;CP-8)— 消费: Rust restore + TS 投影(审计展示)— fixture: pending-32-04 — realdb-sample(恢复场景用例)
- event: code_edit_auto_rejected — 新 event_type(code_edit 确认被拒/取消的级联拒绝审计;32-03)— 消费: Rust confirmations + TS 投影 — fixture: pending-32-03 — projection-cases.json
- event: spawn — 预留(spawn_subagent,ADR-0004;Phase 33)— 落点/消费/fixture 待 Phase 33 登记时补 — fixture: pending-phase-33 —
- event: pipeline_gate — 预留(pipeline 编排确认门;Phase 34)— fixture: pending-phase-34 —
- event: skill_injected — 预留(Skill FTS5 检索注入审计;Phase 35)— fixture: pending-phase-35 —

## 维护规则

1. 新事件种类/payload 字段先登记本清单,再写实现。
2. 实现落地时:条目 `fixture:` 翻成 `yes`,并在 `src/ai/__tests__/fixtures/` 补双侧
   用例(命名 = 上文各条目注明的文件)。
3. CI 互锁(`cargo test -p nova_pm_workspace parity`)强制第 2 条;`pending-` 前缀是
   唯一豁免形态,合并前不得残留已落地条目的 pending。
