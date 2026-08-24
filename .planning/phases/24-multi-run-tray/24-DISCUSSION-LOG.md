# Phase 24: 多 run 并行 + 后台运行(托盘) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-08-24
**Phase:** 24-多 run 并行 + 后台运行(托盘)
**Areas discussed:** 托盘形态, 通知时机, 并发上限, 取消入口

---

## 托盘形态

| Option | Description | Selected |
|--------|-------------|----------|
| 极简菜单 | 只「显示 Nova」「退出」;跳转靠通知点击 | |
| 带 run 列表 | 动态运行中 run 列表(session 标题+状态),点击跳对应 session;状态变化重建菜单 | ✓ |

**User's choice:** 带 run 列表(非推荐项 — 用户要托盘直达)

---

## 通知时机

| Option | Description | Selected |
|--------|-------------|----------|
| 仅后台场景通知 | 窗口隐藏时:run 完成/等待 HITL 确认;前台不通知;点击聚焦+跳 session | ✓ |
| 全部通知 | 所有 run 完成都弹(含前台) | |

**User's choice:** 仅后台场景通知

---

## 并发上限

| Option | Description | Selected |
|--------|-------------|----------|
| 上限 3 + 排队 | FIFO 排队,完成自动开始,状态 UI 可见 | ✓ |
| 上限 3 + 拒绝 | 超限报错提示 | |
| 无上限 | 各自独立跑,无闸 | |

**User's choice:** 上限 3 + 排队

---

## 取消入口

| Option | Description | Selected |
|--------|-------------|----------|
| 仅应用内 | engine_cancel 既有;后台取消回 app 操作 | ✓ |
| 托盘可取消 | 托盘菜单加取消项 | |

**User's choice:** 仅应用内取消

---

## Claude's Discretion

- 队列实现(semaphore vs channel)、生命周期事件结构、菜单刷新节流
- 托盘图标运行态换图与否、tooltip 文案、排队 UI 呈现

## Deferred Ideas

- 通用无头 workspace_root 来源(v0.5+ IM)
- 托盘 per-run 取消(未来按反馈)
- 定时触发 run(v0.4+ pipeline)
