# Phase 8 Plan 01 Summary

## Implementation

- Installed `@mdxeditor/editor@4.2.0` in `package.json` and `package-lock.json`.
- Added `MarkdownEditor` with `React.lazy`, `Suspense`, `Skeleton`, `forwardRef`, and the Nova editor API: `value`, `onChange`, `readOnly`, `placeholder`, `className`, and `minHeight`.
- Added `MarkdownEditorInner` using the version 4.2 API. The table plugin is `tablePlugin` in this version; the obsolete `tablesPlugin` name was not used. `codeBlockPlugin` is included as the core code-block support required by the 4.2 API.
- Exported `MarkdownEditor` from `src/components/ui/index.ts`.
- No ProductKnowledgeTab, KnowledgeBaseView, Phase 9, or Phase 11 source files were changed.

## Plugin Set

The editor uses these eight plugins:

1. `toolbarPlugin` (edit mode only)
2. `headingsPlugin`
3. `listsPlugin`
4. `tablePlugin`
5. `linkPlugin`
6. `quotePlugin`
7. `markdownShortcutPlugin`
8. `codeMirrorPlugin` with `autoLoadLanguageSupport: false`

`codeBlockPlugin` is the lightweight core support paired with `codeMirrorPlugin`; it is not an additional toolbar feature.

No `frontmatterPlugin`, `sandpackPlugin`, `imagePlugin`, or `diffSourcePlugin` is imported.

## Compatibility

- Declared React: `^19.0.1`; installed: `19.2.8`.
- Declared React DOM: `^19.0.1`; installed: `19.2.8`.
- Declared TypeScript: `~5.8.2`; installed: `5.8.3`.
- Declared Tailwind CSS: `^4.1.14`; installed: `4.3.3`.
- `@mdxeditor/editor@4.2.0` declares React 18/19 peer compatibility.

## Verification

- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed.
- Lazy chunk: `MarkdownEditorInner-*.js`, approximately 920.94 KB raw / 297.31 KB gzip.
- Editor CSS chunk: 48.72 KB raw / 8.15 KB gzip.
- A/B check: removing `codeMirrorPlugin` and the code-block toolbar button reduced the editor JavaScript chunk to 486.43 KB raw / 156.22 KB gzip, but removed CodeMirror code-block editing. It was rejected because code blocks are required.
- The retained combined editor assets are approximately 305.46 KB gzip: below the 400 KB tolerance, but above the approximately 250 KB target. `autoLoadLanguageSupport: false` prevents automatic grammar loading at runtime, but the package still statically includes CodeMirror language metadata; this remains a bundle risk to monitor.
- Nova token overrides are scoped under `.nova-markdown-editor .mdxeditor` and the editor CSS is loaded only with the lazy inner module.

## UAT Status

Browser rendering, Tailwind visual coexistence, toolbar interaction, Markdown shortcut behavior, and Chinese IME behavior were not manually tested in this plan. The consumer views are intentionally outside this plan's change scope, so no runtime UAT pass is claimed.

Consumer import for later plans:

```tsx
import { MarkdownEditor } from '@/src/components/ui';
```
