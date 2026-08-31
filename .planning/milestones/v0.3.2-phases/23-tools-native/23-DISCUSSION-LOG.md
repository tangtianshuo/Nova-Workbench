# Phase 23: 工具层(原生工具集,无桥) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 23-工具层(原生工具集,无桥)
**Areas discussed:** exec 白名单, fs 边界, 桥去留(含方向澄清), deliverable 形态

---

## exec 白名单

| Option | Description | Selected |
|--------|-------------|----------|
| 安全只读白名单 + HITL 学习 | 内置只读命令(git status/diff/log、ls、cat 等)默认放行;白名单外 HITL,确认时可选「仅本次」或「永久加入」(DB 持久化);不建设置 UI | ✓ |
| 纯静态白名单,全部 HITL | 所有命令一律 HITL,无默认白名单 | |
| 白名单内直接执行含写命令 | 白名单含写操作(npm install 等)直接执行 | |

**User's choice:** 安全只读白名单 + HITL 学习
**Notes:** 精确命令清单交 researcher/planner。

---

## fs 边界

| Option | Description | Selected |
|--------|-------------|----------|
| workspace 内读自由/写 HITL,越界拒绝 | file_ops.rs 路径安全先例;workspace 外 error 拒绝 | ✓ |
| workspace 内读写自由 | 仅 workspace 外写走 HITL | |
| 所有写都 HITL | 任何文件写入都弹确认卡 | |

**User's choice:** workspace 内读自由/写 HITL,越界拒绝

---

## 桥去留(核心决策,含方向澄清)

用户先澄清方向:「TS 桥 是 TS 调用 rust?还是 Rust 调用 TS」— 回答:Rust 调用 TS(loop 主人在 Rust,工具实现留在 webview,IPC 回调)。

随后用户质疑桥本身:「能否不用桥?这增加了不少架构复杂度,能否 rust 原生直接进行数据操作」。

 scouting 证据:业务数据 = kv_store 整库 JSON 快照(zustand persist → sqliteStorage),非关系表;knowledge/memory 已原生(v0.3.0 已关系化);桥真实覆盖面仅 blob 持久的 CRUD。

| Option | Description | Selected |
|--------|-------------|----------|
| A. 保留桥(ADR 原计划) | 桥约一个 plan 工作量;v0.3.3 删;期间能力无倒退 | |
| B. 不建桥,推迟到 v0.3.3 | PM CRUD 继续缺席;TOOL-03 改写;接受 v0.3.2 期间 agent 建不了任务/日程 | ✓ |
| C. 提前数据迁移直接原生 | v0.3.3 关系化提前进 Phase 23;里程碑范围翻倍 | |

**User's choice:** B. 不建桥,推迟到 v0.3.3
**Notes:** 推翻 ADR-0003 物料决策 #3;ADR/REQUIREMENTS/ROADMAP 三处已同步修订。桥超时/降级问题随之 moot。

---

## deliverable 形态

| Option | Description | Selected |
|--------|-------------|----------|
| 生成原生 + 落槽走桥 | llm.rs 生成草稿 → HITL 候选;确认后落槽经桥 | ✓(桥取消后修订) |
| 全桥(生成也走 TS) | 整个 generateDeliverable 经桥回调 TS | |

**User's choice:** 生成原生 + 落槽走桥
**Notes:** 桥取消后修订为:落槽 = webview 用户确认动作(TS 写业务表,合法)+ agent_events 落库走 Rust command(与 carry-in 接缝同模式)。

---

## Claude's Discretion

- 白名单精确命令清单、kv key 结构
- exec 进程管理 Windows 实现方案
- 工具注册表扩展方式、deliverable prompt 复刻细节

## Deferred Ideas

- 白名单设置页 UI(v0.3.3)
- PM CRUD Rust 原生工具(v0.3.3 正主)
- Phase 10 PM 工具指南文本恢复(v0.3.3)
