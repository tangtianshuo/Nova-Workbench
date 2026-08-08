# Requirements: Nova PM Workspace

**Defined:** 2026-08-08
**Core Value:** 让产品经理拥有一个懂你、能替你干活的桌面 AI Agent(Pipeline + 第二大脑 + HITL)

## v1 Requirements

本里程碑聚焦四条主线:暗色模式上线、本地持久化、Tauri IPC 替代 Express AI、GraphFlow + Rig PoC。每个需求映射到唯一一个 phase。

### Dark Mode(Phase 1)

- [ ] **DARK-01**: 用户可以在 Settings 中切换主题为 Light / Dark / System 三态
- [ ] **DARK-02**: 用户可以在 Header 通过快捷按钮一键切换主题
- [ ] **DARK-03**: 当系统主题变化时(System 模式),Nova 自动跟随,无需重启
- [ ] **DARK-04**: 在 Linux 上,System 模式通过 GTK 检测垫片正确响应 GNOME/KDE 主题(避开 Tauri#9427)
- [x] **DARK-05**: 所有 Card 变体(default/elevated/glass/interactive/dark)在暗色下视觉正确,无对比度问题
- [x] **DARK-06**: 所有 11 个 view + 16 个 Product 子组件在暗色下无 token 缺失(无白底/黑字/不可见边框)
- [ ] **DARK-07**: 主题切换有平滑的颜色过渡动画,无闪烁

### Persistence(Phase 2)

- [x] **PERSIST-01**: 用户刷新页面或重启 app 后,所有 5 个 Zustand store 数据完整恢复
- [x] **PERSIST-02**: 每个存储的 `partialize` 配置正确剔除 transient flag(模态开关、loading 状态等)
- [x] **PERSIST-03**: 每个 store 有显式 `version: 1` 和 `migrate` 存根,未来 schema 变更有迁移通道
- [x] **PERSIST-04**: 引入 SQLite(`tauri-plugin-sql`)作为前端持久化后端,而非裸 localStorage
- [x] **PERSIST-05**: Zustand persist 通过 ~20 行 `createJSONStorage` 适配器对接 `@tauri-apps/plugin-store`
- [x] **PERSIST-06**: SQLite migration 是 forward-only additive,带启动期 sanity SELECT 和 `schema_version` 表,避免 Tauri SQL 静默失败
- [x] **PERSIST-07**: `_hasHydrated` flag 阻止渲染期空状态闪烁
- [x] **PERSIST-08**: 修复 `rndStore` 的 `INITIAL.p1` fallback bug(CONCERNS.md HIGH),防止持久化错误产品的数据
- [x] **PERSIST-09**: 首次运行时(无 DB 数据)从 `mock*.ts` 播种初始数据,带 `has_seeded` flag 防重复

### Tauri IPC & AI Migration(Phase 3)

- [x] **IPC-01**: 创建 `src/lib/tauri.ts` 适配器作为单一 chokepoint,所有 invoke/Channel/listen 经此路由,`invoke` 不出现在 views/stores
- [x] **IPC-02**: 适配器内部 `isTauri()` 分支:在 Tauri 环境走 `invoke()`,在 dev/web 环境回退到 `fetch('/api/...')`(保留 dev/prod parity)
- [x] **IPC-03**: 至少一个 AI 端点(推荐 `/generate-project` 或新增 chat)迁移到 Tauri command,用 `Channel<StreamChunk>` 流式输出 token
- [x] **IPC-04**: 服务端 AI 调用支持 `CancellationToken`,前端可通过 Stop 按钮中断进行中的请求
- [x] **IPC-05**: 客户端 AI 调用有 `AbortController`(配合 IPC-04),触发按钮在生成中禁用,防止重复请求堆叠
- [x] **IPC-06**: AI 错误(网络/解析/截断)以用户可读消息呈现(toast/inline),不再以 500 错误吞没
- [x] **IPC-07**: 引入 `rig-core` 替代 `@google/genai`(Gemini 仍为首选 provider)
- [x] **IPC-08**: Rust 端 `AppError` enum + 手动 `serde::Serialize` 实现作为统一 IPC 错误类型
- [x] **IPC-09**: Express server 收缩到 dev-only,从 Tauri 生产 bundle 路径中移除(`build:server` 不再进 prod)
- [x] **IPC-10**: Express dev 服务器绑定 `127.0.0.1` 替代 `0.0.0.0`

### Security Baseline(Phase 3)

- [x] **SEC-01**: Tauri production build 中显式声明 CSP(当前 `csp: null` 是 debt),`style-src self unsafe-inline`、`script-src` default-deny
- [ ] **SEC-02**: CSP 在 IPC 迁移同 phase 落地,通过 `tauri build`(非 dev)验证 Tailwind v4 inline style + Radix + motion 都正常
- [x] **SEC-03**: 每个 feature 一个 capability 文件(sql.json / llm.json / pipeline.json),显式 scope 到 `${appData}/nova.db`
- [ ] **SEC-04**: 每个 Tauri command 在 CI 或本地脚本中从 webview 烟测,确认 capability 不静默拒绝
- [x] **SEC-05**: LLM API key 通过 `keyring` crate 直连 OS keychain 存储,不进 `.env`、不进 bundle、不暴露给 webview
- [x] **SEC-06**: 用户首次启动时(Settings 引导)录入 API key,通过 keychain 持久化,后续启动从 keychain 读
- [ ] **SEC-07**: AI prompt 中用户输入与系统指令分离(Rig 的 `system_instruction` vs `contents`),减少 prompt injection 面

### GraphFlow + Rig PoC(Phase 4,feature-flagged)

- [ ] **POC-01**: 修正 `docs/DECISIONS.md` ADR-002(移除 "v1.4.2 / 99.99% 可用性" 虚构声明,记录 pre-1.0 状态,移除 "Juncture" 引用,替换 fallback 为 `rust-langgraph` 或自研 FSM)
- [ ] **POC-02**: Phase 4 scope 严格基于 docs.rs/graph-flow 当前 API,不基于设计文档
- [ ] **POC-03**: 实现 2-3 节点的最小 pipeline(如 `analyze_requirements` → WaitForInput → `generate_prd`),用 trait 隔离 GraphFlow 实现
- [ ] **POC-04**: 自研 `SqliteSessionStorage` 实现 GraphFlow `SessionStorage` trait(复用 Phase 2 的 sqlx 连接池)
- [ ] **POC-05**: HITL `WaitForInput` 通过 Tauri IPC 事件/Channel 推到前端,前端展示最小审批 UI(approve / reject)
- [ ] **POC-06**: 应用关闭-重启-恢复场景通过:Pipeline 在 approve 前关闭,重启后能从 checkpoint 恢复等待 approve
- [ ] **POC-07**: 整个 PoC 通过 feature flag(`NOVA_PIPELINE_POC`)启用,默认关闭,失败不影响其他功能
- [ ] **POC-08**: PoC 决策门:落地 → 下一里程碑扩展到完整需求→PRD Pipeline;失败 → 重新评估引擎选型(sidecar fallback 或自研)

## v2 Requirements

延后到下一里程碑,本里程碑不实现。

### Second Brain(LanceDB 向量检索)

- **BRAIN-01**: 用户可以将产品文档、PRD、知识文章索引到 LanceDB 向量库
- **BRAIN-02**: 用户可以通过自然语言查询知识库,返回语义相关文档
- **BRAIN-03**: AI 对话时自动检索知识库作为上下文增强(RAG)

### Full PM Pipeline

- **PIPE-01**: 完整 10 节点 Pipeline(需求分析→PRD→原型→代码→测试→交付物汇总),每个节点带 HITL
- **PIPE-02**: Pipeline 支持循环(拒绝→修改→重审),iteration_count 限制防无限循环
- **PIPE-03**: Pipeline 时间旅行(从历史 checkpoint 恢复)
- **PIPE-04**: 多 Pipeline 并发执行(同一用户多产品并行推进)
- **PIPE-05**: Pipeline 节点级 progress 事件流式推送

### Multi-Provider LLM

- **LLM-01**: 用户可以在 Settings 中切换 LLM Provider(Anthropic / OpenAI / Google / Ollama)
- **LLM-02**: 用户可以为不同任务配置不同 Provider(如代码生成用 Claude,聊天用 Gemini)
- **LLM-03**: 本地 Ollama 模型支持(离线降级)

### Distribution Hardening

- **DIST-01**: Windows 构建代码签名(避免 SmartScreen 警告)
- **DIST-02**: macOS 公证(notarization)
- **DIST-03**: Auto-updater 配置(签名 release artifact + JSON hosting)

## Out of Scope

显式排除,防止 scope creep。

| Feature | Reason |
|---------|--------|
| 完整 LanceDB 第二大脑 | 设计文档 Phase 4 范围,本里程碑只做架构铺垫,PoC 完成后下一里程碑立项 |
| 完整 10 节点 PM Pipeline | 设计文档 Phase 2-3 范围,本里程碑 PoC 验证可行性即止 |
| 多人协作 / 云同步 | "本地优先"是设计原则;SQLite 单机足够;云同步触发条件未到 |
| URL 路由 | 当前 `activeTab` state 够用,深链/分享是未来需求 |
| AppContext 全量移除 | 跟随各 view 迁移到 direct store hook 时逐步消除,不在本里程碑单独 phase |
| 多窗口 | 当前单窗口足够;多窗口需要 capability scope 重设计 + Zustand 跨窗口同步,不在本里程碑 |
| Express 5 升级 | Express 路线是收缩到 dev-only 并最终删除,不是现代化 |
| Tailwind v4 → v5 升级 | 当前 v4 工作良好,无升级驱动 |
| 国际化 (i18n) | UI 文案目前混合中英文,统一化是后续 polish 任务 |
| 错误边界组件 | 单独的小改进,不放入本里程碑(可在 Phase 1-2 之间穿插) |
| CI/CD pipeline | 当前 `tsc --noEmit` 仅本地跑,加 GitHub Action 是后续基础设施 |
| Distribution Hardening(代码签名 / 公证 / auto-updater) | PROJECT.md 未将 distribution 纳入本里程碑;`tauri build` 本地通过即足够,DIST-01/02/03 延后到下一里程碑 |

## Traceability

由 roadmapper 在创建 ROADMAP.md 时填充。每个 v1 requirement 必须映射到唯一一个 phase。

| Requirement | Phase | Status |
|-------------|-------|--------|
| DARK-01 | Phase 1 | Pending |
| DARK-02 | Phase 1 | Pending |
| DARK-03 | Phase 1 | Pending |
| DARK-04 | Phase 1 | Pending |
| DARK-05 | Phase 1 | Complete |
| DARK-06 | Phase 1 | Complete |
| DARK-07 | Phase 1 | Pending |
| PERSIST-01 | Phase 2 | Complete |
| PERSIST-02 | Phase 2 | Complete |
| PERSIST-03 | Phase 2 | Complete |
| PERSIST-04 | Phase 2 | Complete |
| PERSIST-05 | Phase 2 | Complete |
| PERSIST-06 | Phase 2 | Complete |
| PERSIST-07 | Phase 2 | Complete |
| PERSIST-08 | Phase 2 | Complete |
| PERSIST-09 | Phase 2 | Complete |
| IPC-01 | Phase 3 | Complete |
| IPC-02 | Phase 3 | Complete |
| IPC-03 | Phase 3 | Complete |
| IPC-04 | Phase 3 | Complete |
| IPC-05 | Phase 3 | Complete |
| IPC-06 | Phase 3 | Complete |
| IPC-07 | Phase 3 | Complete |
| IPC-08 | Phase 3 | Complete |
| IPC-09 | Phase 3 | Complete |
| IPC-10 | Phase 3 | Complete |
| SEC-01 | Phase 3 | Complete |
| SEC-02 | Phase 3 | Pending |
| SEC-03 | Phase 3 | Complete |
| SEC-04 | Phase 3 | Pending |
| SEC-05 | Phase 3 | Complete |
| SEC-06 | Phase 3 | Complete |
| SEC-07 | Phase 3 | Pending |
| POC-01 | Phase 4 | Pending |
| POC-02 | Phase 4 | Pending |
| POC-03 | Phase 4 | Pending |
| POC-04 | Phase 4 | Pending |
| POC-05 | Phase 4 | Pending |
| POC-06 | Phase 4 | Pending |
| POC-07 | Phase 4 | Pending |
| POC-08 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 41 total(DARK: 7, PERSIST: 9, IPC: 10, SEC: 7, POC: 8)
- Mapped to phases: 41
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-08*
*Last updated: 2026-08-08 after roadmap creation — traceability expanded to one row per requirement ID*
