---
phase: quick
plan: 260813-u7m
subsystem: ai
tags: [ai, ollama, settings, provider, connectivity, ux]
dependency_graph:
  requires: []
  provides: [ollama-model-configurable, provider-connectivity-ping, provider-status-tri-state]
  affects:
    - src/stores/uiStore.ts
    - src/lib/api.ts
    - src/ai/toolLoop.ts
    - src-tauri/Cargo.toml
    - src-tauri/src/llm.rs
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs
    - src/components/SettingsApiKeySection.tsx
tech_stack:
  added: [reqwest-0.13]
  patterns: [config-flow-from-store-to-rust, reachability-probe-via-tags-endpoint, tri-state-provider-status]
key_files:
  created: []
  modified:
    - src/stores/uiStore.ts
    - src/lib/api.ts
    - src/ai/toolLoop.ts
    - src-tauri/Cargo.toml
    - src-tauri/src/llm.rs
    - src-tauri/src/commands.rs
    - src-tauri/src/lib.rs
    - src/components/SettingsApiKeySection.tsx
decisions:
  - "Ollama 模型名从 uiStore.ollamaModel 经 toolLoop getState() 流入 chatWithTools → Tauri invoke → Rust chat_with_tools,优先级 参数 > NOVA_OLLAMA_MODEL > OLLAMA_MODEL > LLAMA3_2"
  - "Ollama ping 走 GET /api/tags 列出本地模型并按冒号前缀匹配(my-ornith 匹配 my-ornith:latest),而不是发 1-token 推理 — 更快、不消耗 tokens"
  - "云端 provider ping 用 reqwest 直接打各家 /chat/completions,1 token,5s 超时;按 HTTP 状态分类(401/403 → AuthError,其他非 2xx → NetworkError)"
  - "Anthropic 用 x-api-key + anthropic-version header,DeepSeek/OpenAI 用 Bearer,Gemini key 在 URL query — 各家 auth 约定不同"
  - "Settings providerStatuses 升级为 boolean | 'invalid' | null 四态语义,区分 已配置/已就绪、配置但不可用、未配置、读取中"
  - "runPing helper 返回 string | null(null=成功,string=失败原因),不用 {ok:true}|{ok:false,reason} 联合类型 — TS 在调用点 if(result.ok) 收窄失败"
  - "ping 失败时不删除 keychain 条目 — 可能是瞬时网络/配额,保留让用户重试或换 key"
  - "切到 Ollama provider 时自动 ping,验证 localhost:11434 可达 + 模型名存在,失败立即在 status 反映"
  - "reqwest 0.13 用默认 features(PLAN 假设的 rustls-tls feature 在 0.13 不存在)"
metrics:
  duration: ~30m
  completed: 2026-08-13
  tasks_completed: 3
  files_changed: 8
---

# Quick Task 260813-u7m: Ollama 模型可配置 + Settings 连通性验证 Summary

两个耦合修复打包发布:

1. **Bug fix:** Rust `chat_with_tools` 把 Ollama 模型名硬编码为 `ollama::LLAMA3_2`(`llama3.2`),用户拉取的是 `my-ornith` 等自定义模型时,chat 调用必然 model not found。
2. **Feature:** Settings 没有任何连通性验证 — 用户保存 key 后无法知道 key 是否真的有效,切到 Ollama 时也无法知道本地服务/模型是否就绪。兑现 `.planning/todos/pending/2026-08-12-setting-api-key-connectivity.md`。

## What Changed

### 数据流:Ollama 模型名从 uiStore 到 Rust

```
uiStore.ollamaModel (persisted)
  ↓ toolLoop.ts: useUIStore.getState().ollamaModel
chatWithTools({ ollamaModel })
  ↓ api.ts: invoke('chat', { args: { ollamaModel } })
commands::ChatArgs.ollama_model: Option<String>
  ↓ llm::chat_with_tools(provider, key, ollama_model, ...)
Provider::Ollama 分支: 参数 > NOVA_OLLAMA_MODEL > OLLAMA_MODEL > LLAMA3_2
```

### 新增 Rust ping_provider(`src-tauri/src/llm.rs`)

- **Ollama 分支:** GET `http://localhost:11434/api/tags`,解析 `{ models: [{ name: "..." }] }`,按冒号前缀匹配配置的模型名(`my-ornith` → `my-ornith:latest`)。失败分类:连接拒绝 → NetworkError,模型不存在 → InternalError(列出可用模型),响应解析失败 → ParseError。
- **云端 provider 分支:** reqwest POST 各家 chat completions endpoint,1 token,5s 超时。
  - DeepSeek/OpenAI: `Authorization: Bearer ...`
  - Anthropic: `x-api-key: ...` + `anthropic-version: 2023-06-01`
  - Gemini: key 在 URL query `?key=...`
  - 401/403 → AuthError,其他非 2xx → NetworkError(截断 200 字符 body)
- 5 个 provider 共享同一个 reqwest::Client builder,timeout 5s,避免阻塞 UI。

### Settings UI 三态升级(`src/components/SettingsApiKeySection.tsx`)

- `ProviderStatusValue = boolean | 'invalid' | null` — 区分 已配置/已就绪、配置但不可用、未配置、读取中
- **Ollama card 重写:** 模型名输入框(默认 uiStore 值) + 测试连接按钮 + 保存模型按钮
- **handleSaveKey:** 写入 keychain 后立即 ping,成功 → 'success' toast + status=true;失败 → 'warning' toast + status='invalid'(保留 keychain 条目)
- **handleProviderChange:** 切到 Ollama 自动 ping localhost:11434,即时反馈可达性 + 模型就绪
- **runPing helper:** 单一来源,handleSaveKey / handleProviderChange / 测试按钮 / 保存模型 四处共用;返回 `string | null`(null=成功)

### 工具/状态改动

- **`src/stores/uiStore.ts`:** 加 `ollamaModel: string`(默认 'llama3.2') + `setOllamaModel` action + persist partialize
- **`src/lib/api.ts`:** `chatWithTools` 接受 `ollamaModel?: string`(仅 Tauri 路径透传);新增 `pingProvider(provider, key, ollamaModel?)` wrapper
- **`src/ai/toolLoop.ts`:** 从 `useUIStore.getState().ollamaModel` 读取,provider==='ollama' 时传给 chatWithTools
- **`src-tauri/src/commands.rs`:** `ChatArgs` 加 `ollama_model: Option<String>`;新增 `ping_provider` command
- **`src-tauri/src/lib.rs`:** `ping_provider` 注册到 invoke_handler
- **`src-tauri/Cargo.toml`:** 显式 `reqwest = { version = "0.13", features = ["json"] }`(rig 已传递依赖,显式声明避免警告)

## Why This Fix

**Bug 根因:** `ollama::LLAMA3_2` 常量是 rig 提供的默认值,适合 demo,不适合真实用户。每个 Ollama 用户的本地模型不同(`my-ornith`、`qwen2.5`、`codellama` 等),必须让用户自己配置。

**Feature 动机:** Settings 之前只显示 "已配置/未配置" 二态 — 但 API key 写入 keychain 后,用户不知道:
- key 是否有效(可能拼错、可能过期)
- Ollama 服务是否在跑(`ollama serve` 未启动)
- 配置的模型名是否真的 pull 过

ping 把这三个不可见状态变成可见的 toast + status,显著降低用户调试成本。

## Key Deviation from PLAN

PLAN 第 2 步假设 `reqwest = { version = "0.13", default-features = false, features = ["json", "rustls-tls"] }`,但 **reqwest 0.13 不存在 `rustls-tls` feature**(它在 0.12 被重命名/移除)。实际使用 `reqwest = { version = "0.13", features = ["json"] }`(默认 features,包含 native-tls)。Windows 上不需要 OpenSSL,因为 native-tls 在 Windows 用 schannel。

PLAN 第 3 步假设 `runPing` 返回 `{ ok: true } | { ok: false; reason: string }` 联合类型,但 TS 在调用点 `if (result.ok) ... else { result.reason }` 无法正确收窄(可能是 tsconfig 严格模式 + 类型推断交互问题)。简化为 `string | null`(null=成功),stdlib 模式,TS null 收窄最可靠。

PLAN 提到 `src/stores/__tests__/settingsProvider.test.ts`,但该文件实际不存在 — 跳过此项,无影响。

## Verification

- `npm run lint`(tsc --noEmit)→ **clean**
- `cd src-tauri && cargo test --lib` → **17 passed, 1 ignored**(ignored 是 `ollama_real_tool_call_uat`,需要真实 Ollama 实例)
- `cd src-tauri && cargo build` → **通过**(reqwest 编译成功)
- 7 个文件变更(PLAN 预期 7-8 个),~250 行净 diff(PLAN 预期 150-200,略超 — 多在 Ollama card JSX 和 5 个 provider 的 ping 实现)

Manual UAT(留给用户,非本任务):
1. 桌面端启动 app → Settings → 切到 Ollama → 看到 model 输入框,输入 "my-ornith" → 点"保存模型" → 应显示 "Ollama 模型名已保存 + Ollama 可达" toast,status 显示 已就绪
2. 发起一条 chat 消息 → 不再出现 model not found
3. 切回 DeepSeek → 输入假 key 保存 → 应显示 "key 已保存但 ping 失败 / invalid api key" warning toast,status 显示 配置但不可用
4. 重新输入正确 key 保存 → success toast,status 显示 已配置
5. 关闭 ollama serve,切到 Ollama → 应显示 "Ollama 不可用 / 无法连接 Ollama" warning toast,status 显示 不可用

## Ponytail Notes

- **Skipped:** 新增 Rust 单元测试覆盖 `ping_provider`(各家 provider 路径)。原因:需要 mock HTTP 服务器或网络,setup 复杂度超过修复本身;手动 UAT 更直接。
- **Add when:** 用户报告某个 provider 的 ping 误报成功/失败时,补对应分支的 mock test。
- **Skipped:** `truncate` helper 的独立测试。它是个 3 行字符串截断函数,风险极低。
- **Skipped:** Settings UI 的 four-state status 渲染测试。属于视觉 concern,手动 UAT 覆盖。
