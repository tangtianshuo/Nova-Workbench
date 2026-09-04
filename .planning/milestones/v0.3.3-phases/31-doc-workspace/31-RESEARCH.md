# Phase 31: 文档工作区 — Milkdown 编辑器 + 右侧常驻面板 - Research

**Researched:** 2026-09-03
**Domain:** Milkdown v7 headless 编辑器封装 / 布局层改造 / knowledge_docs 扩展 migration / 确认卡多宿主
**Confidence:** HIGH (editor API 官方文档核验) / MEDIUM (IME/bundle 待 PoC 实测)

## Summary

Milkdown 当前版本为 **7.22.1**(2026-09-03 npm registry 核验,`@milkdown/kit` / `@milkdown/react` 同版本)。官方 React recipe 确认了完整封装路径:`MilkdownProvider` → `useEditor`(创建)+ `useInstance`(子组件内取实例)+ `listener` 插件的 `markdownUpdated` 回调 → `editor.action(replaceAll(md))` 做外部 value 注入,`editor.action(getMarkdown())` 做读出。这与 D-03 的受控契约(`value`/`onChange`)一一对应,无需 fork 或 hack。

代码侦察确认三个关键事实:①三个 MDXEditor 使用点**全部已经过 `MarkdownEditor` 统一入口**(`src/components/ui/MarkdownEditor.tsx` lazy 包装),迁移只需重写 `MarkdownEditorInner.tsx` 一个文件,3 个使用点零改动;②现有 `Drawer`(`src/components/ui/Drawer.tsx`)是 Radix Dialog modal 实现 —— **有 overlay、点击外部即关**,与 D-04「两侧并存互不遮挡」冲突,⌘K Drawer 左滑不能只是加个 `side` prop,需要非模态化改造或换实现;③`knowledge_docs.product_id` 是 `NOT NULL`(`0004_memories_knowledge_fts.sql:59`),全局笔记(无产品归属)需要 migration 0014 同时处理 `doc_kind` 列与 product_id 可空性(或哨兵值)。

**Primary recommendation:** 用 `@milkdown/kit` + `@milkdown/react` 重写 `MarkdownEditorInner.tsx`(保持 props 契约),布局用 flex 常驻右栏(非 Drawer)承载工作区、⌘K Drawer 改非模态左滑,migration 0014 加 `doc_kind` 列并放宽 `product_id`。首个 plan 内做 IME/round-trip PoC。

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** 编辑器 = Milkdown core(`@milkdown/kit` + `@milkdown/react`),headless 模式,不用 Crepe preset。toolbar/主题/交互全部 Nova tokens + Phosphor 自建。
- **D-02:** MDXEditor 全量退役:3 使用点(KnowledgeBaseView / ProductKnowledgeTab / PrdDraftDialog)同期迁移;删 `@mdxeditor/editor` 依赖、`patches/@mdxeditor+editor+4.2.0.patch`、token 覆盖 CSS 层。收口:grep 零 `@mdxeditor`/`mdxeditor` 残留。
- **D-03:** 受控组件契约保持:`value`/`onChange`/`readOnly`/`placeholder`/`className`/`minHeight`,lazy-load 保持,Zustand 同步走 listener `onChange`,不靠 re-render 注入。
- **D-04:** 右侧常驻文档工作区:可收起、可拖宽;⌘K AI Drawer 改从左侧滑出;两侧并存互不遮挡。
- **D-05:** 三场景验收锚点:①修改 AI 产出(槽位/knowledge_write 双源,保存回 knowledge_docs)②日常笔记(新建/编辑/FTS5 可检索)③阅读审批 AI 文档。
- **D-06:** 笔记落 knowledge_docs 扩展:migration 加 `doc_kind='note'`,允许无 productId 归属(全局);复用 FTS5/版本化/knowledge 管线;不建新表。
- **D-07:** 确认卡在工作区内多宿主渲染:chatConsoleStore 全局确认队列仍是唯一真相源;diff 视图不做 v1。
- **D-08:** docx/pdf/excel/ppt 预览 = 技术债,v1 纯 markdown,预留预览接口位。

### Claude's Discretion
- 工作区文档列表信息架构(按产品/doc_kind/最近打开分组过滤)
- toolbar 具体按钮集(基线:撤销/标题/粗斜体/列表/链接/表格/代码块)
- 调宽交互(拖拽手柄 vs 预设档位 vs 两者)
- Milkdown 插件集(commonmark 必选;gfm 表格/删除线、代码块高亮按需)
- 自动保存策略(防抖间隔、失焦即存)

### Deferred Ideas (OUT OF SCOPE)
- docx/pdf/excel/ppt 只读预览(技术债)
- diff 视图(AI 原稿 vs 修改稿)
- excel 真编辑
- Milkdown 协同编辑(CRDT/yjs)
</user_constraints>

<phase_requirements>
## Phase Requirements

无正式 REQ-ID;31-CONTEXT D-01..D-08 为权威。Success Criteria 1-7 映射:

| SC | 描述 | 研究支撑 |
|----|------|----------|
| SC-1 | 工作区打开/编辑/保存 markdown,版本化落 knowledge_docs,重启不丢 | 受控封装模式(下文 Pattern 1)+ knowledgeRepo 既有 upsert 版本链(migration 0004 superseded_at 模式) |
| SC-2 | 全局笔记 doc_kind=note,FTS5 可检索 | Migration 0014 设计(下文「数据模型」)+ FTS5 现有 standalone 表自动覆盖新 kind |
| SC-3 | 确认卡工作区内渲染,确认/拒绝不离开工作区 | chatConsoleStore 7+1 pending 字段 + selectPendingCount 派生先例(第三宿主抽取) |
| SC-4 | ⌘K Drawer 左滑,与右栏同屏并存 | Drawer 现状 = Radix Dialog modal,需非模态化(下文 Pitfall 1) |
| SC-5 | MDXEditor 全量退役 grep 零残留 | 三使用点均已过 MarkdownEditor 单一入口,重写 Inner 即可;删 patch-package 引用(package.json postinstall) |
| SC-6 | 编辑器 UI 全 tokens + Phosphor | Milkdown headless 零 CSS,自建 toolbar 走 callCommand(下文 Pattern 3) |
| SC-7 | IME/round-trip 真机 UAT | IME 已知问题清单(下文 Pitfall 2)+ PoC 清单 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- 禁硬编码色值:只能 `bg-bg-primary`/`text-text-*`/`border-border-*`/`bg-accent` 等语义 token 类
- Phosphor icons only,`weight="duotone"`
- `cn()` 组合类,`className` 永远最后
- Tailwind v4 `@theme`(无 config 文件);`motion/react` 动画
- Zustand 新代码直接 `useXxxStore()`,不走 `useApp()`
- migration forward-only,编号续 0014
- `npm run lint` = tsc --noEmit 是唯一自动 gate;测试 = `tsx --test`(node:test)
- patch-package 经 `postinstall` 钩子运行 —— 删 MDXEditor patch 时注意 patch-package 保留(其它 patch 可能存在,删除前 `ls patches/`)

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @milkdown/kit | 7.22.1 | 聚合包:core/preset/plugin/components 统一入口 | 官方推荐安装方式;固定同版本子包避免实例分裂 |
| @milkdown/react | 7.22.1 | React 绑定:MilkdownProvider/useEditor/useInstance | 官方 React recipe(2026-09-03 milkdown.dev 核验) |

**注意:** `@milkdown/react` 的 dependencies 里有 `@milkdown/crepe`(7.22.1)—— 这不强制 Crepe 进 bundle(Vite tree-shake 掉未引用部分),但 PoC 时应跑 `vite build` 确认 chunk 里无 crepe 残留。

### Kit 内含(无需单独安装,`@milkdown/kit/...` 子路径导入)
| 模块 | 用途 | 本 phase |
|------|------|----------|
| `@milkdown/kit/core` | Editor/rootCtx | 必用 |
| `@milkdown/kit/preset/commonmark` | commonmark preset | 必用(D-03 契约基线) |
| `@milkdown/kit/preset/gfm` | 表格/删除线/任务列表/自动链接 | 推荐用(现 MDXEditor 有 InsertTable,gfm 表格是基线能力;round-trip 架构级保真) |
| `@milkdown/kit/plugin/history` | undo/redo | 必用(toolbar 撤销按钮) |
| `@milkdown/kit/plugin/listener` | markdownUpdated → onChange | 必用(受控契约核心) |
| `@milkdown/kit/plugin/clipboard` | markdown 剪贴板粘贴 | 推荐(否则粘贴 HTML 丢格式) |
| `@milkdown/kit/plugin/cursor` | 光标平滑 | 可选 |
| `@milkdown/kit/plugin/block-editing` | 拖拽手柄 | 不用(自建极简,v1 略) |
| `@milkdown/kit/plugin-tooltip` / `plugin-slash` | 官方 UI 组件配套 | 不用(D-01:自建 UI);slash menu 可作 v2 增强 |
| `@milkdown/utils` | getMarkdown/replaceAll/callCommand/insert | 必用(toolbar + 受控同步) |
| `@milkdown/kit/prose/*` | ProseMirror re-export | 命令构建时用(如 setBlockType) |

### 代码块高亮(discretion)
现 MDXEditor 用 codeMirrorPlugin + @codemirror/language-data 懒加载。Milkdown 生态对应 `@milkdown/plugin-code-highlight`(需配 prism 主题 CSS,与 D-01「无外部编辑器默认 CSS」有摩擦)。**建议 v1 用 commonmark 原生 code fence + Nova tokens 自定义 `pre/code` 样式,语法高亮记技术债** —— 与 D-08 预览债同一批。

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gfm preset | 纯 commonmark + 手写 table schema | 不值得;gfm 是官方 preset,round-trip 由架构保证 |
| @milkdown/components(官方 UI) | 全自建 toolbar | D-01 已锁自建;官方组件自带样式需覆盖,回到 MDXEditor CSS 税 |
| @milkdown/crepe | core | D-01 已锁禁用 |

**Installation:**
```bash
npm install @milkdown/kit@7.22.1 @milkdown/react@7.22.1
npm uninstall @mdxeditor/editor
# 删 patches/@mdxeditor+editor+4.2.0.patch(先 ls patches/ 确认无其它 patch 再决定 postinstall 去留)
```

**版本核验(2026-09-03):** `@milkdown/kit` 7.22.1(latest),`@milkdown/react` 7.22.1,unpacked 体积 kit 121KB / core 205KB / preset-commonmark 425KB / preset-gfm 290KB / react 111KB(source,未压缩;min+gzip 后预计 chunk ~150-250KB,vs @mdxeditor/editor unpacked 623KB、现 chunk ~297KB)。**净变化需 build 实测**(PoC 项④)。

## Architecture Patterns

### Recommended Project Structure
```
src/components/ui/
├── MarkdownEditor.tsx           # 保留:lazy 壳,零改动
├── MarkdownEditorInner.tsx      # 重写:Milkdown 实现,同 props 契约
└── MarkdownToolbar.tsx          # 新:tokens+Phosphor toolbar(discretion)
src/components/workspace/        # 或 views/DocWorkspaceView 风格
├── DocWorkspacePanel.tsx        # 右侧常驻面板壳(列表+编辑器+确认卡宿主)
├── DocList.tsx                  # 文档列表(discretion:分组/过滤)
└── WorkspaceConfirmCard.tsx     # 确认卡第三宿主(或抽取共用组件)
src/stores/docWorkspaceStore.ts  # 新:面板开合/宽度/当前文档(persist 走 uiStore 或独立)
src-tauri/migrations/0014_doc_kind_note.sql
```

### Pattern 1: Milkdown 受控组件封装(D-03 核心)
**What:** `useEditor` 创建一次(配置不随 props 变),外部 `value` 变更经 `replaceAll` 注入,内部编辑经 `listener.markdownUpdated` 走 `onChange`。
**When to use:** `MarkdownEditorInner.tsx` 重写。
**关键点(官方 docs 核验):**
- `useEditor` 的 factory **只在 mount 跑一次** —— plugins/config 不能依赖会变的 props
- `MilkdownProvider` 边界:`useInstance`/`useEditor` 必须在其子树内;受控组件结构 = `MilkdownProvider > EditorComp(useEditor) + Toolbar(useInstance)`
- 防回环:外部 value 注入用「本地最后发出的 markdown」ref 做脏检查,避免 onChange→setState→replaceAll→markdownUpdated 死循环

```tsx
// Source: https://milkdown.dev/docs/recipes/react (2026-09-03 核验)
import { Editor, rootCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { replaceAll, getMarkdown } from '@milkdown/kit/utils';

function MilkdownEditor({ value, onChange, readOnly }: Props) {
  const lastEmitted = useRef(value); // 防回环脏检查
  const { get } = useEditor((root) =>
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        lastEmitted.current = markdown;
        onChange(markdown);
      });
    }).use(commonmark).use(gfm).use(history).use(listener).use(clipboard),
    [readOnly] // readOnly 变化才重建;onChange 用 ref 桥接避免重建
  );

  useEffect(() => {
    // 外部 value 变更(且非自己刚发出的)→ 替换文档
    if (value !== lastEmitted.current) {
      get()?.action(replaceAll(value));
      lastEmitted.current = value;
    }
  }, [value]);

  return <Milkdown />;
}

// 对外暴露的 handle:toolbar 和 PrdDraftDialog 等用
// const [loading, getInstance] = useInstance(); // 必须在 MilkdownProvider 内
// getInstance()?.action(getMarkdown())
```

**已知坑:**
- `replaceAll(markdown, flush?)` 第二参 `flush: true` 会重建 editor state(清 history/撤销栈);默认 false。受控外部注入建议传 `true` 避免撤销回到旧文档,但**换文档时机传 true、用户自己的编辑不要触发 replaceAll** —— 依赖 lastEmitted 脏检查天然满足
- `markdownUpdated` 在每次 transaction 都触发(含输入法 composition 中的部分场景),onChange 链路要做防抖或至少保证 cheap(纯 setState 即可)
- 光标/滚动:`replaceAll` 会重置光标到文档头 —— 外部 value 注入只发生在「切换文档」场景时是正确行为;**不要在每次 onChange 后把 value 原样回灌**(防回环脏检查即为此)
- `useEditor` deps 数组变更会销毁重建编辑器,readOnly 切换走重建可接受,onChange 引用变化不可进 deps(用 ref 存最新 onChange)

### Pattern 2: 右侧常驻面板 + ⌘K 左滑(D-04)
**What:** MainLayout `flex-1` 内容区右侧加常驻 `<aside>`;⌘K Drawer 改为非模态左滑。
**When to use:** `src/App.tsx` MainLayout + `src/components/ui/Drawer.tsx`。
**推荐实现(ponytail 阶梯):**
- 右侧工作区 = **普通 flex `<aside>`,不是 Drawer** —— 常驻面板需要与主内容同屏可交互,天然非模态。宽度状态:`uiStore` 加 `docWorkspaceOpen`/`docWorkspaceWidth`(persist partialize 加入),拖宽 = 左边缘 4px 手柄 + `mousedown/mousemove` clamp(min 360 / max 60% vw),无需库
- ⌘K 左滑:现 `DrawerContent` 是 `fixed right-0` + Radix Dialog(modal、overlay、外点关闭)。ChatPanel 需要非模态并存 —— 最小改法是 `DrawerContent` 加 `side?: 'left' | 'right'` prop + `modal={false}`(Radix Dialog 支持 `modal` 在 Root 上;`modal={false}` 时无 overlay、不锁交互、不关外点)。注意 `modal={false}` 下需要手动处理 Esc 和焦点
- **改动面:** `ui/Drawer.tsx`(side + modal 透传)、`ChatPanel.tsx`(`<Drawer modal={false}>` + side="left")、`App.tsx`(MainLayout 加 aside)、`uiStore.ts`(2 字段 + partialize)

### Pattern 3: 自建 toolbar 调 Milkdown 命令(D-01)
**What:** toolbar 按钮 = `editor.action(callCommand(key, payload))`。
**When to use:** MarkdownToolbar。
```tsx
// Source: https://milkdown.dev/docs/api/utils (callCommand 宏)
import { callCommand } from '@milkdown/kit/utils';
import { toggleStrongCommand, wrapInBulletListCommand,
         insertHrCommand, turnIntoHeadingCommand } from '@milkdown/kit/preset/commonmark';
import { insertTableCommand } from '@milkdown/kit/preset/gfm';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';

const [loading, getInstance] = useInstance(); // MilkdownProvider 子树内
const run = (fn: (ed: ReturnType<GetInstance>) => void) => {
  const ed = getInstance(); if (ed) fn(ed);
};
// <Button variant="ghost" size="sm" onClick={() => run(ed => ed.action(callCommand(turnIntoHeadingCommand.key, 2)))}>
```
命令 key 从各 preset 导出(commonmark: turnIntoHeadingCommand/toggleStrongCommand/toggleEmphasisCommand/wrapInBulletListCommand/wrapInOrderedListCommand/toggleInlineCodeCommand/wrapInBlockquoteCommand/insertCodeBlockCommand;gfm: insertTableCommand/toggleStrikethroughCommand;history: undoCommand/redoCommand;link: toggleLinkCommand 需 payload {href})。**具体 key 名以 `@milkdown/preset-commonmark` 7.22.1 的 .d.ts 为准(plan 时 IDE 内确认)—— 本清单来自官方 preset 文档,列为 MEDIUM 置信。**
基线按钮集(对齐现 MDXEditor toolbar,discretion 落点):Undo/Redo、H1-H3、Bold/Italic/Strikethrough、Bullet/Ordered list、Quote、Link、Table、Code inline/Code block。

### Pattern 4: 确认卡第三宿主(D-07)
**What:** 订阅 chatConsoleStore 的 pending 字段子集,渲染精简确认卡。
**先例:** `src/ai/pendingCount.ts` selectPendingCount(7 nullable 字段 + pendingDeliverables.length)已把「读哪些字段」收敛成一处;AgentConsole 是双宿主(`layout="drawer" | "page"`)先例。
**建议:** 工作区确认卡不复用 AgentConsole(那是完整聊天台),而是新建精简 `WorkspaceConfirmCard`,按 pendingCount 同一字段清单订阅、逐 kind 渲染 confirm/reject 按钮,动作直调 chatConsoleStore 既有 `confirmKnowledgeWrite`/`rejectXxx` actions(真相源不动)。工作区场景优先渲染与当前打开文档相关的 pendingConfirmation(KnowledgeWriteCandidate),其余 kind 折叠为计数 + 「去 AI 台」跳转。
**注意:** 现 AgentConsole 的确认 UI 是嵌在消息流里的,没有独立可复用的 ConfirmCard 组件 —— 抽取时先看 `AgentConsole.tsx` 内各 pending 分支的渲染,能抽就抽公共展示件,不能抽就工作区自渲染(数据源同一 store,真相源不破)。

### Anti-Patterns to Avoid
- **把 Milkdown config 写成随 value 变** —— useEditor factory 只跑一次,value 同步只能走 replaceAll effect
- **onChange 回灌 value** —— 死循环 + 光标跳动
- **右侧工作区用 modal Drawer** —— overlay 挡主内容,违背 D-04「互不遮挡」
- **新编辑器引外部主题 CSS**(nord/prism) —— D-01 明令禁止,回到 CSS 覆盖税
- **直接 `npm i prosemirror-*`** —— 官方 FAQ 警告双实例 bug;必须走 `@milkdown/kit/prose/*`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| markdown↔富文本双向转换 | 自写 parser | ProseMirror/Remark(Milkdown 内置) | round-trip 保真是架构级保证,自写必丢表格/嵌套列表 |
| markdown 剪贴板 | 监听 paste 自己解析 | `@milkdown/kit/plugin/clipboard` | 处理各平台 HTML/纯文本 fallback |
| undo/redo 栈 | 自己存快照 | `@milkdown/kit/plugin/history` | ProseMirror history 处理 composition/协作边界 |
| 版本化存储 | 新表 | knowledge_docs 既有 (doc_id, version) + superseded_at 链 | D-06 锁定;knowledgeRepo.upsert 已有整链路 |
| 面板宽度拖拽 | 手写全局 drag 系统 | 一个 mousedown+mousemove handler | ~30 行,引库不值 |

## Common Pitfalls

### Pitfall 1: ⌘K Drawer「左滑」≠ 加 side prop
**What goes wrong:** 现 Drawer 是 Radix Dialog modal(overlay + 外点关闭 + 焦点陷阱)。仅改定位到左侧,打开 AI Drawer 时右栏工作区仍被 overlay 挡住/失焦,外点工作区直接关 Drawer,「同屏并存互不遮挡」(D-04)落空。
**Why:** Radix Dialog 默认 modal 语义。
**How to avoid:** `<Drawer modal={false}>`(Root 级 prop)+ side 定位;Esc 关闭需 Content 上 `onEscapeKeyDown` 或 Radix 非 modal 默认行为确认;测试「Drawer 开着时点工作区文字可编辑且 Drawer 不关」。
**Warning signs:** UAT 时「打开 ⌘K 后右栏点不动」。

### Pitfall 2: 中文 IME composition(PoC 项①)
**What goes wrong:** ProseMirror 历史上多个 IME bug:中文输入首字母被吞(discuss.prosemirror.net #7931)、composition 中粘贴破坏输入法(#4251)、inclusive:false mark 附近多出意外文本(#6603)、表格内拼音组合未清除(prosemirror-tables #334)。
**Why:** composition 事件与 PM transaction 的竞态;WebView2 Chromium 内核跟随 Edge 版本。
**How to avoid:** ①用最新 7.22.1(内含近年 PM composition 修复);②**首个 plan 内真机 PoC**:Tauri WebView2 下中文输入(空行首字、选中后重输、composition 中粘贴、表格内输入)四场景;③若首字被吞,排查是否有代码在 markdownUpdated 里同步做重 DOM 操作(防抖 onChange 链路)。
**Warning signs:** UAT 打字丢字、拼音候选框错位。
**Sources:** [PM #7931](https://discuss.prosemirror.net/t/why-does-the-first-letter-get-truncated-when-using-a-chinese-input-method-with-prosemirror-in-a-web-component/7931), [PM #6603](https://discuss.prosemirror.net/t/extra-unexpected-text-input-when-selection-end-is-touch-mark-which-inclusive-is-false-with-ime-mode/6603), [PM #4251](https://discuss.prosemirror.net/t/paste-during-ime-composition-corrupts-ime/4251), [prosemirror-tables #334](https://github.com/ProseMirror/prosemirror-tables/issues/334)

### Pitfall 3: markdownUpdated→onChange→replaceAll 死循环
**What goes wrong:** 受控组件把 onChange 发出的 value 再 replaceAll 回编辑器,光标跳文档头、输入卡顿、composition 中断。
**How to avoid:** lastEmitted ref 脏检查(Pattern 1);replaceAll 仅在「外部真正换文档」时发生。
**Warning signs:** 每敲一字光标回行首。

### Pitfall 4: knowledge_docs.product_id NOT NULL
**What goes wrong:** 全局笔记(D-06,无 productId)直接 INSERT 违反 0004 的 `product_id TEXT NOT NULL`。
**How to avoid:** migration 0014 双动作:`ALTER TABLE knowledge_docs ADD COLUMN doc_kind TEXT NOT NULL DEFAULT 'document'` + SQLite 不能 DROP NOT NULL(3.25+ 除外……实际 SQLite 不支持 ALTER COLUMN)→ 用「新建表+copy+rename」或**哨兵 product_id('__global__')**。哨兵改动面最小(repo 不改 schema 类型,查询时 `$1 IS NULL OR product_id=$1` 已兼容);rename 重建表则干净但要小心 FTS join 与 forward-only 纪律。**推荐哨兵方案**(ponytail:语义债记注释,FTS/版本链零改动);若坚持真 NULL,须重建表 + 重插 FTS(FTS 行不可更新,0004 注释明示)。
**Warning signs:** migration 0014 里出现 `ALTER TABLE ... DROP NOT NULL`(SQLite 不支持)。

### Pitfall 5: rndStore 投影过滤吞掉 note
**What goes wrong:** `hydrateKnowledgeFromRepo`(rndStore.ts:290)按 productId 分桶 `knowledgeBase[productId]`,且 `category === 'deliverable'` 有特殊路由;note 无 productId、doc_kind 新增 —— 现投影循环要么漏掉、要么塞错桶。
**How to avoid:** rndStore 保持现状(按产品投影),note 走 docWorkspaceStore 独立查询(repo 加 `listNotes()` 或 `listDocs({docKind})`);KnowledgeBaseView 的全局搜索走既有 `searchKnowledgeHybrid`(FTS 按 doc_rowid join,自动覆盖 note —— FTS 表是行级 insert,写 note 时照常插 FTS 即可,无需改索引)。

### Pitfall 6: category 语义 vs doc_kind 混淆
**What goes wrong:** 现有 category 承载业务分类('deliverable'/'PRD需求'/竞品分类…),若把 note 又做成一个 category 值,投影过滤逻辑(多处 `category === 'deliverable'`)会误伤。
**How to avoid:** doc_kind 是正交维度(document/note),default 'document' 使旧行为零变化;category 对 note 可用 'note' 或复用现有枚举,但投影过滤只在 docKind='document' 分支跑。

### Pitfall 7: patch-package postinstall 残留
**What goes wrong:** 删了唯一 patch 文件但留 postinstall,新环境 install 报 patch-package 找不到 patch 报错(部分版本 warning,部分 fail)。
**How to avoid:** `ls patches/` 后决定;若空则删 postinstall script + 可卸 patch-package devDependency。

## Data Model: migration 0014 设计

```sql
-- 0014: doc workspace — doc_kind for global notes (Phase 31, D-06)
ALTER TABLE knowledge_docs ADD COLUMN doc_kind TEXT NOT NULL DEFAULT 'document';
-- 全局归属:哨兵方案(不重建表,FTS/版本链零改动)
-- repo 层约定:productId 为 null 的 note 写入 '__global__'
UPDATE meta SET value = '14' WHERE key = 'schema_version';
-- 注意:0012/0013 的 schema_version 处理方式以现有 initializeDatabase 为准(继续 +1)
```
TS 侧:`knowledgeRepo.ts` `KnowledgeDocInput` 加 `docKind?: 'document' | 'note'`;list/search 加 docKind 过滤;note 的 FTS insert 走既有 `INSERT INTO knowledge_fts`。Rust 侧:knowledge_docs 写路径在引擎(engine knowledge 工具),note 由 webview 直写(ADR-0003 边界,CONTEXT 已确认),**Rust 侧确认无需感知 doc_kind(引擎只写 document)** —— 但 `SELECT *` 反序列化新列时 Rust struct 若用 deny_unknown_fields 会炸,plan 时 grep Rust 侧 knowledge_docs 读取点确认。

## Code Examples

### 保存回 knowledge_docs(SC-1/SC-2,复用既有 upsert 版本链)
```ts
// 既有 knowledgeRepo.upsert 已做:version+1、superseded_at 打点、FTS insert。
// 工作区保存 = 调 repo.upsert({ docId, productId: currentProduct ?? '__global__',
//   docKind: isNote ? 'note' : 'document', title, content, ... })
// 然后刷新投影(rndStore.hydrateKnowledgeFromRepo / docWorkspaceStore.reload)。
```

### 面板宽度拖拽(D-04)
```tsx
const onResize = (e: React.MouseEvent) => {
  const startX = e.clientX; const startW = width;
  const move = (ev: MouseEvent) =>
    setDocWorkspaceWidth(Math.min(Math.max(startW + (startX - ev.clientX), 360), window.innerWidth * 0.6));
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
};
// <div onMouseDown={onResize} className="w-1 cursor-col-resize hover:bg-accent shrink-0" />
```

## State of the Art

| Old | Current | When | Impact |
|-----|---------|------|--------|
| ATOMIC-EDITOR.md(2026-08-10)否决 Milkdown「React 19 问题」 | 2026-09-03 复核失效,v7.22.1 React 官方一等支持 | v7.2x 系 | D-01 已锁,选型关闭 |
| MDXEditor(vendored patch + 200 行 token CSS 覆盖) | Milkdown headless(零自带 CSS) | 本 phase | SC-5/SC-6,删除 CSS 税 |
| ⌘K 右侧 modal Drawer | 左侧非模态 + 右侧常驻面板 | 本 phase | Drawer.tsx 加 side/modal |

## Open Questions

1. **IME 真机表现(LOW → PoC 定)**
   - What we know: PM 历史 IME bug 清单 + 7.22.1 含修复;WebView2 = Chromium,理论风险低于旧 Safari。
   - What's unclear: Tauri WebView2 + gfm 表格 + composition 的组合实测。
   - Recommendation: 首 plan PoC 四场景(Pitfall 2),不过则降级排期再议。
2. **Bundle 净变化(MEDIUM)**
   - unpacked 对比有利(kit 全家 ~1.2MB source vs mdxeditor 623KB,但按需 import 后 min+gzip 预计 ~150-250KB vs 现 297KB chunk);`@milkdown/react` 依赖 crepe 需 build 确认 tree-shake 干净。
   - Recommendation: PoC 项跑 `vite build` 对比 chunk 报表。
3. **gfm 命令 key 精确名(MEDIUM)**
   - insertTableCommand 等 key 名来自官方 preset 文档记忆,plan 时以 7.22.1 .d.ts 为准。
4. **Rust 侧 SELECT knowledge_docs 是否受新列影响(LOW)**
   - grep `src-tauri` knowledge_docs 读取点;serde 默认忽略未知字段,风险低,plan 内一查即知。

## Environment Availability

Step 2.6: 无新增外部工具依赖(Milkdown 是纯 npm 依赖;WebView2 已是 Tauri 运行前提)。SKIPPED 详表。

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node 22+ / npm | install | ✓ | 项目已用 | — |
| Tauri WebView2 | IME UAT | ✓ | 现有 dev 环境 | — |

## Validation Architecture

nyquist_validation = false(`.planning/config.json`)—— 跳过自动化测试矩阵。

**测试现状:** `npm run test` = `tsx --test`(node:test),现覆盖 lib/stores/ai 投影。可低成本补:`docWorkspaceStore` 纯逻辑、`selectPendingCount` 已有先例风格、笔记 repo 过滤(memory repo fallback 可测)。编辑器本体(IME/round-trip/布局)→ **真机人工 UAT**(SC-7),沿用 Phase 30 HUMAN-UAT checklist 模式。

## Sources

### Primary (HIGH)
- https://milkdown.dev/docs/recipes/react — useEditor/MilkdownProvider/useInstance/listener markdownUpdated/auto-save 完整模式(2026-09-03 抓取)
- https://milkdown.dev/docs/api/utils — replaceAll(markdown, flush)/getMarkdown/callCommand 宏签名
- npm registry(2026-09-03)— @milkdown/kit@7.22.1 / @milkdown/react@7.22.1 版本、依赖树、unpackedSize
- 代码侦察:MarkdownEditor(In|ner).tsx、ui/Drawer.tsx、App.tsx、uiStore.ts、rndStore.ts、chatConsoleStore.ts、pendingCount.ts、knowledgeRepo.ts、migrations 0004/0010、package.json

### Secondary (MEDIUM)
- @milkdown/kit 依赖清单(plugins/components/presets 全集)— npm view
- Milkdown 官方 FAQ(prosemirror 双实例警告)
- ProseMirror preset 命令 key 名 —— 待 .d.ts 终验

### Tertiary (LOW)
- IME bug 清单 —— ProseMirror 官方论坛多帖交叉,方向可信、版本相关性未逐条核验
- bundle gzip 估计 —— 未实测,PoC 定

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 官方 docs + registry 双核验,7.22.1 锁定
- 受控封装模式: HIGH — 官方 recipe 逐条对上 D-03;防回环细节为工程常识(MEDIUM 部分:replaceAll flush 语义建议 PoC 验证)
- 布局改造: HIGH — Drawer.tsx 116 行全读,Radix modal 语义明确
- 数据模型: HIGH — migration/knowledgeRepo 全读;哨兵 vs 重建表的取舍已给出推荐
- IME/bundle: LOW-MEDIUM — 论坛/体积数据,真机 PoC 前不算数

**Research date:** 2026-09-03
**Valid until:** 2026-10-03(Milkdown 活跃发版,plan 前 recheck latest 是否仍 7.22.x)
