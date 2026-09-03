# Phase 31 — 真机 UAT 清单(31-05 Task 1)

运行方式:`npm run tauri:dev`,在真实 Tauri 应用中逐项执行 SC-1..7。全部通过后本 phase 收口。

## 预检结果(自动化,executor 执行于 2026-09-03)

| 项 | 命令 | 结果 |
| -- | ---- | ---- |
| TypeScript | `npm run lint` | ✅ 零错误 |
| 生产构建 | `npm run build` | ✅ 23.92s;编辑器 chunk `MarkdownEditorInner` 374.03 KB(gzip 114.61 KB,预算 300KB gzip 内) |
| MDXEditor 残留 | `grep -ri mdxeditor src/ package.json patches/` | ✅ 零残留(patches 目录已不存在) |

## 检查项

### SC-1 打开/编辑/自动保存/重启持久(版本化)

- [ ] **SC-1.1** 在主工作区知识库(或产品知识 tab)点击一篇 AI 产出的知识文档:右侧面板滑出并打开(31-06 后入口在主工作区,面板无列表)
- [ ] **SC-1.2** 修改正文内容,等待自动保存(防抖)或失焦触发;无手动保存按钮要求
- [ ] **SC-1.3** 完全退出应用重新打开(`npm run tauri:dev` 重启):同一文档内容为修改后版本,不丢
- [ ] **SC-1.4** 版本化:同一 docId 多次编辑保存后版本号递增(可在 31-05-SUMMARY 记录验证 SQL:`SELECT doc_id, COUNT(*) FROM knowledge_doc_versions WHERE doc_id = '...' GROUP BY doc_id`)

### SC-2 全局笔记 + FTS5 检索

- [ ] **SC-2.1** 知识库视图 header 点「新建笔记」(31-06 后入口在知识库,非面板内):右侧面板打开空白笔记(不选产品归属,doc_kind=note,product_id='__global__')
- [ ] **SC-2.2** 输入中文内容(含独特关键词,如「海马体笔记测试锚点」)并保存
- [ ] **SC-2.3** 打开知识库视图(KnowledgeBaseView),用该中文关键词全局搜索:笔记命中且可打开

### SC-3 确认卡第三宿主

- [ ] **SC-3.1** 触发一次 agent 产出待确认文档(运行工作流或对话生成 deliverable)
- [ ] **SC-3.2** 待确认文档的确认卡出现在右侧工作区内(不离开工作区)
- [ ] **SC-3.3** 在工作区内点确认:文档落库,AgentConsole 全局确认队列同步清空该项(两宿主状态一致)
- [ ] **SC-3.4** (可复测)再触发一条,在工作区点拒绝:队列同步移除,文档不落库

### SC-4 ⌘K 左滑 + 两侧并存

- [ ] **SC-4.1** 右侧工作区面板开着时按 ⌘K(Ctrl+K):AI Drawer 从**左侧**滑出
- [ ] **SC-4.2** 两侧同屏并存互不遮挡;焦点在右侧编辑器时可直接打字(⌘K 不抢输入/Darawer 不关)
- [ ] **SC-4.3** 在 Drawer 内输入对话正常;Esc 关闭 Drawer,右侧工作区状态不变

### SC-5 MDXEditor 零残留(自动化项 — 已由预检覆盖)

- [x] **SC-5.1** `grep -ri mdxeditor src/ package.json patches/` 零命中;`@mdxeditor/editor` 不在 dependencies;vendored patch 已删(见预检表)

### SC-6 编辑器视觉全 tokens

- [ ] **SC-6.1** 编辑器与 toolbar 外观全部 Nova tokens 风格:无外部编辑器默认主题痕迹(无突兀蓝紫默认色、无默认圆角/阴影打架)
- [ ] **SC-6.2** toolbar 按钮 Phosphor duotone 图标;深浅交互态正常(hover/active)
- [ ] **SC-6.3** 31-06 入口移交后:KnowledgeBaseView/ProductKnowledgeTab 内联编辑已移除(点击改开面板);PrdDraftDialog 保留(工作流裁定),其编辑器外观与工作区一致(同一组件)

### SC-7 中文 IME + round-trip + 面板交互

- [ ] **SC-7.1** IME 四场景(31-01 UAT 已过,回归确认):①中文连续输入候选上屏 ②拼音组合中不丢字 ③组合中按 toolbar 按钮不破坏 composition ④中英混排
- [ ] **SC-7.2** 表格 round-trip:插入/编辑表格单元格 → 保存 → 重开,表格结构与内容无损
- [ ] **SC-7.3** 代码块 round-trip:fenced code block(含语言标注)→ 保存 → 重开无损
- [ ] **SC-7.4** 嵌套列表 round-trip:多级有序/无序嵌套 → 保存 → 重开层级无损
- [ ] **SC-7.5** 面板交互:拖宽手柄调宽流畅;收起/展开面板状态在重启后保持(persist)

### SC-8 overlay 联动 + 禅模式 + 入口移交(31-06,D-09..D-13)

- [ ] **SC-8.1** 主工作区点击文档:面板向**右侧滑出 overlay**,主工作区窗体大小不变(不被挤压、无布局重排)
- [ ] **SC-8.2** 面板打开时点击主工作区其他位置:面板保持打开、不抢焦点、不收起(手动收起按钮有效)
- [ ] **SC-8.3** 禅模式:面板工具栏切换按钮进入 → 主工作区内容隐藏、左侧导航保留、编辑区占满;再点退出恢复;收起面板自动退出禅模式;重启后禅模式状态保持
- [ ] **SC-8.4** 面板内无文档列表/文档名索引区块,只有预览与编辑(+确认卡)
- [ ] **SC-8.5** 知识库「新建笔记」与产品知识 tab「编辑」点击后均在右侧面板打开(全部入口收敛)

## 结果记录(UAT 后填写)

| 项 | 结果 | 备注 |
| -- | ---- | ---- |
| SC-1 | 待验 | |
| SC-2 | 待验 | |
| SC-3 | 待验 | |
| SC-4 | 待验 | |
| SC-5 | ✅ 通过 | 自动化预检(2026-09-03) |
| SC-6 | 待验 | |
| SC-7 | 待验 | |
| SC-8 | 待验 | 31-06 D-09..D-13(2026-09-03 UAT 中段裁定) |

**结论:待用户真机逐项签核后填写。**
