---
created: 2026-08-12T09:28:44.457Z
title: Setting 中填入 API Key 时增加连通性验证
area: ui
files:
  - src/components/SettingsApiKeySection.tsx
  - src/lib/api.ts
---

## Problem

当前在 Settings 面板填入 provider API key（DeepSeek / OpenAI / Anthropic / Gemini）保存时，没有即时校验 key 是否可用、是否连通。用户只有到后续真正发起 AI 调用（生成项目、总结工作区等）才会发现 key 错了，错误暴露得晚、定位成本高，体验差。

`SettingsApiKeySection` 已经有 `providerStatuses: Record<Provider, boolean | null>` 的状态框架（用于展示 key 是否已配置），但目前只是「存在性」层面的标记，不是「可用性」。

Ollama 是本地 provider，无 key，应跳过连通性检查。

## Solution

在保存 key 的流程里加一次轻量级 ping：

- **触发点**：`SettingsApiKeySection` 中 `isSavingKey` 流程结束后、关闭输入框之前
- **执行端**：复用 `invokeProviderCommand` 走 Tauri 命令（与现有 provider 状态加载同一条路径），server.ts fallback 模式下走 Express
- **ping 设计**：每个 provider 一次最小请求
  - DeepSeek / OpenAI / Anthropic / Gemini：models.list 或一条 `messages` 含 1 token 的 chat，只看 HTTP status
  - 超时 5s，避免阻塞 UI
- **结果展示**：复用现有 `providerStatuses`，但语义从「已配置」升级为「已配置且可用 / 配置但不可用 / 未配置」三态
  - 失败时 Toast 显示具体原因：401 invalid key / 403 quota / 网络超时 / 其他
  - 用户可以选择「保留但标记不可用」或「重新输入」
- **Ollama**：跳过 key 校验，但可以 ping `http://localhost:11434` 检查本地服务在跑

实现时注意：现在 `loadAvailableProviders` 类型的逻辑已经在做某种状态加载，先读懂它再决定是改这个函数还是新增 `verifyKey(provider, key)` 命令。
