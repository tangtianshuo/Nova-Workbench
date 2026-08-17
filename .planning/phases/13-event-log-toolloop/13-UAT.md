---
status: needs-fixes
phase: 13-event-log-toolloop
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md]
started: 2026-08-17T13:00:00+08:00
updated: 2026-08-17T15:05:00+08:00
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

session complete — 7/7 resolved:6 pass / 1 issue(GAP-13-01 blocker)
next: gap closure 修复 → 回归 Test 4 + Test 5 awaitingConfirmation 子项

## Tests

### 1. 冷启动 + 迁移 0002
expected: Tauri 应用启动无错误弹窗;nova.db 中 agent_events / agent_artifacts 表存在(schema v2+)
result: pass

### 2. 纯文本对话回归(13-02 投影重构无感)
expected: ChatPanel 发一条纯文本消息(如「你好」),流式回复正常,无 UI 回归
result: pass

### 3. 普通工具调用链(13-03 单历史 toolLoop)
expected: 发「帮我建个任务 …」→ createTask 直接执行(设计上免确认:仅 delete*/knowledgeWrite/deliverable 需 HITL)→ 助手按协议建议截止日期并等待用户确认;多工具链(createTask/getTaskDependencies/listProducts)全部成功
result: pass
note: 原测试预期误写为「createTask 需确认卡片」— 已纠正为设计行为(prompts.ts destructive 白名单);用户实测流程与 prompts.ts:30-34 截止日期协议完全一致

### 4. Destructive 工具 HITL 确认卡片(13-03 WAIT 语义)
expected: 发「把刚才创建的那个任务删掉」→ 出现删除确认卡片(而非直接删除);等待确认期间对话流 trace 不变红;点确认后任务删除、助手汇报结果
result: issue
reported: |
  fail — 删除操作需要确认令牌,刚才的调用没有成功(令牌无效或已过期);deleteTask 失败,
  系统返回错误:确认令牌无效或已过期,且该调用已没有更多重试机会;
  任务「济南元宇宙专家端上线问题排查2」(ID: 380b6d0b-e9e6-4c4f-b210-737db987728b)仍然存在,未被删除;
  模型建议替代方案:1. 在界面上手动删除 2. 稍后重试
severity: blocker

### 5. 事件序列落库(核心残留风险:真实 INSERT 无自动化覆盖)
expected: 测试 3/4 之后查 nova.db agent_events:完整配对序列 session_created → user_message → tool_call → tool_result → assistant_message → turn_ended,seq 连续无空洞,同一 turn 共享 correlation_id;确认 WAIT 分支的 tool_result 带 awaitingConfirmation 语义(Claude 代查,用户核对结果)
result: pass
note: |
  Claude 代查 2026-08-17:全表 71 行 seq 1-71 零空洞;session_created 仅 1 行(lazy);5 个 turn 结构完整
  (user_message → context_injected → tool_call/tool_result×N → assistant_message → turn_ended),同 turn 共享 correlation_id;
  tool_call/tool_result 按 toolCallId 严格配对(error 路径同样配对 — seq 62/63、68/69);turn_ended 元数据齐全;
  context_injected 记录五段 segments。唯一例外:awaitingConfirmation 语义全库 0 次 — WAIT 分支未被真实触发,
  与 GAP-13-01 同根因,修复后回归覆盖。

### 6. 超长工具结果 artifact 化(EVT-08)
expected: 触发一次大结果工具(如知识库搜索/文件读取)→ 对话中显示摘要而非全文倾倒;agent_artifacts 表 count ≥ 1(Claude 代查)
result: pass
note: |
  用户触发 readKnowledgeArticle:UI 呈现总结+引用,无原文倾倒。Claude 代查:agent_artifacts 恰 1 行,
  全文 21,860 字符完整落库;事件 seq 101 tool_result 仅携带 summary+artifactId 引用;
  对比 seq 91 未超阈值的小结果走内联路径 — 4096 字符阈值判定正确区分两侧。

### 7. 无孤儿会话刷屏(13-02 lazy session_created)
expected: 打开 ChatPanel 但不发消息,agent_events 无新增 session_created 行(构造器零发射)
result: pass
note: |
  用户切换标签并打开/关闭 ChatPanel 未发消息后复查:session_created 仍 1 行,单会话;
  期间仅有的 +2 事件(seq 102/103)为 Test 6 轮次的 assistant_message+turn_ended 收尾(同 correlation_id)— 构造器零发射确认。

## Summary

total: 7
passed: 6
issues: 1
pending: 0
skipped: 0

## Gaps

```yaml
- id: GAP-13-01
  test: 4
  severity: blocker
  symptom: |
    发「把刚才创建的那个任务删掉」→ 无删除确认卡片;deleteTask 报「确认令牌无效或已过期,
    无更多重试机会」;任务未删除;turn 以 outcome=completed 结束(未进入 WAIT 分支)。
  evidence: |
    - agent_events seq 60-71: tool_call args = {"confirmationToken":"济南元宇宙专家端上线问题排查2","confirmed":true,"taskId":"380b6d0b-…"}
      — 模型(llama3.2:1b)首调即凭空编造 token(拿任务标题填充 schema 暴露的参数),跳过两步协议第 1 步
    - tool_result = [tool_error deleteTask] "Destructive action confirmation token is invalid or expired.. No more argument retries are available for this tool call." retryAvailable:false
      — 死路:真实 token 只存在于候选创建返回值里,模型永远拿不到
    - agent_confirmation_candidates 表 0 行 — 候选从未创建 → UI 卡片(pendingDestructiveAction)无从渲染
  diagnosis: |
    两层缺陷叠加。协议 UI 链路本身完好:toolLoop.ts:87/189/194 WAIT 分支 + AgentConsole.tsx:180 确认卡
    + chatConsoleStore.ts:276 回调接线均存在,单测覆盖(taskAdvanced.test.ts:81-101)。
    1. schema 暴露 confirmed/confirmationToken 参数 → 弱模型直接伪造填充,不履行 system prompt 两步协议
    2. confirmed=true 但 token 无效时 consumeDestructiveActionConfirmation throw → tool_error 死路
       (retryAvailable:false),不回落到候选创建 — 该 turn 不可恢复,任务经 agent 删不掉
  artifacts:
    missing:
      - src/ai/tools/taskAdvanced.ts — deleteTask/bulkDeleteTasks: invalid-token 路径应回落 pendingConfirmation(step-1 语义)而非 throw
      - src/ai/tools/scheduleAdvanced.ts — deleteEvent 同款模式同步修
  fix_direction: |
    三处统一:confirmed && token consume 成功才执行;token 缺失或 consume 失败 → 与 !confirmed 分支合流,
    返回 pendingConfirmation + createDestructiveActionCandidate。对任意强度模型自愈:伪造 token 只会得到确认卡片。
```
