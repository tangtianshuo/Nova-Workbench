# Technology Stack — v0.3.3 产研半落地 + 工作区入驻

**Researched:** 2026-08-31
**Scope:** NEW additions only. Existing stack (React 19 + Tauri v2 + Tailwind v4 + Zustand 5 + Rust engine) is locked and NOT re-researched.

## TL;DR

| Need | Recommendation | Version (pin) |
|------|----------------|---------------|
| .docx → text | `zip` + `quick-xml`, hand-rolled `word/document.xml` walker (~100 LOC in `src-tauri/src/engine/ingest/`) | latest stable at add time |
| .pdf → text | `pdf_oxide` (feature `cjk-form-fonts`) | `=0.3.x` exact pin |
| PDF fallback candidate | `unpdf` | 0.6.4 (only if pdf_oxide fails UAT) |
| Tab 内嵌 run 进度/事件流 | Nothing new — `engine_run` Channel events + Zustand run-projection store | — |
| 批量 HITL 确认 UI | Nothing new — existing confirmation queue + Radix Dialog/Checkbox/ProgressBar | — |
| 反向创建产品 | Nothing new — existing productStore + CreateProductModal pattern | — |

**Total new dependencies: 2-3 crates, all pure Rust, zero process spawning.**

## Detailed Rationale

### .docx: hand-rolled zip + quick-xml (do NOT add a docx crate)

.docx is OOXML: a zip containing UTF-8 XML (`word/document.xml`). Text extraction = walk `<w:p>` paragraphs, concat `<w:t>` text nodes, insert `\n` per paragraph.

- **Why hand-rolled:** The docx-read crate ecosystem is weak — `dotext` (anvie) is a 2018-era hobby lib, `docx-lite` has no track record, `docx-rust` is read+write and heavier than needed. All are single-maintainer and less mature than `zip` + `quick-xml` themselves.
- **Why it's safe:** `zip` (cross-platform pure Rust, used by tens of thousands of crates) and `quick-xml` (the de-facto Rust XML parser) are among the most battle-tested crates in the ecosystem. CJK is a non-issue: OOXML text is UTF-8; no encoding layer to get wrong.
- **Integration:** one function `extract_docx_text(path) -> Result<String>` in a new `src-tauri/src/engine/ingest/docx.rs`, called from the ingestion orchestration (not an agent tool — extraction is deterministic pre-processing before the classify/extract run).
- **Ceiling:** ignores embedded objects, tables flatten to text runs, tracked changes come through as plain text. Fine for "scan → classify → extract drafts". If fidelity ever matters, swap in a crate behind the same function signature. `// ponytail: paragraph-level extraction only; table/track-change fidelity = add a crate later`

### .pdf: `pdf_oxide` (primary)

- **Why:** first-class CJK (explicitly advertised: CJK encoding + font decoding; `cjk-form-fonts` feature handles non-embedded Adobe-predefined CJK fonts — common in Chinese Word/WPS-exported PDFs), 100% pass rate claimed on 3,830 real-world PDFs, markdown/plain-text output, very active development.
- **Why CJK is the deciding criterion:** Nova's target docs are Chinese PM documents; `pdf-extract` (0.12, slow cadence, lineage back to 2018) has known mixed CJK/exotic-encoding behavior — rejected.
- **Risk:** pre-1.0, fast-moving API (0.3.x rapid iteration). Mitigation: exact version pin (`=0.3.x`), isolate behind `ingest/pdf.rs` with a single `extract_pdf_text(path) -> Result<String>` signature so upgrades touch one file.
- **Cross-platform:** pure Rust, no external process; identical behavior on Windows/macOS/Linux. Normal Cargo dep in `src-tauri`, no Tauri plugin.

### Fallback: `unpdf` (0.6.4)

iyulab, active, explicit smart CJK + RTL support, Markdown/text/JSON output, MIGRATION guide indicates ongoing evolution. Slightly less aggressive CJK-font claims than pdf_oxide. **Do not add now.** Decision rule: if UAT on real Chinese PDFs (Word/WPS exports) shows pdf_oxide extraction gaps, swap `ingest/pdf.rs` internals to unpdf — same signature, one-file diff.

### Tab-embedded run progress / event projection — zero additions

Everything needed already exists post-v0.3.2:
- `engine_run` via Channel already streams events to the webview (same mechanism chat uses)
- Projection pattern already exists (`ChatSession.fromEvents`); a thin tab-run projection subscribes to the same event stream filtered by run/correlation id
- UI: existing Radix primitives — `ProgressBar` for progress, `Card` + `Badge` for event stream items, existing confirmations queue for HITL cards

**Do not add:** SSE/WebSocket libs (Channel is the transport), state machine libraries (Zustand store + event projection suffices), TanStack Query (local-first, no HTTP).

### Batch HITL confirmation UI — zero additions

Batch confirm = a list of the existing single-confirmation cards. `agent_confirmation_candidates` + atomic consume already handles dedup/persistence; the Rust engine already supports cross-boundary confirmation flows. UI = `Dialog` + `Checkbox` + `ProgressBar` ("12/18 confirmed") + one `Button` — all from `src/components/ui/`.

**Do not add:** react-hook-form / form frameworks (no complex form; Phase 16 PrdDraftDialog is the template).

### 反向创建产品 — zero additions

Existing productStore + CreateProductModal pattern with workspace-doc prefill. The "from workspace" flow is an AI run that produces a candidate Product draft → existing HITL pattern → existing creation path.

## What NOT to Add (explicit)

| Rejected | Reason |
|----------|--------|
| Any Node.js / Python ingestion sidecar | Violates zero-sidecar hard constraint |
| `pdf-extract` | Weak CJK, slow maintenance |
| `docx` / `docx-rust` / `dotext` / `docx-lite` crates | Single-maintainer, weaker track record than zip+quick-xml; the read fidelity we need is ~100 LOC |
| Tika / poppler / external binaries | Process spawning, per-OS distribution burden |
| OCR (tesseract etc.) | Out of scope — scanned PDFs fail gracefully ("no text layer"), v0.5+ if ever |
| Any new frontend npm package | Radix + Zustand + Channel cover all three features |
| Embedding/vector libs | Already Out of Scope per PROJECT.md |

## Installation

```toml
# src-tauri/Cargo.toml [dependencies]
pdf_oxide = { version = "=0.3.77", features = ["cjk-form-fonts"] }  # pin exact; isolate in ingest/pdf.rs
zip = "6"           # verify latest at add time
quick-xml = "0.54"  # verify latest at add time
```

Frontend: no installs.

## Sources & Confidence

| Claim | Source | Confidence |
|-------|--------|------------|
| pdf_oxide CJK + activity + 0.3.x | [docs.rs/pdf_oxide](https://docs.rs/pdf_oxide), [GitHub](https://github.com/yfedoseev/pdf_oxide), [oxide.fyi](https://oxide.fyi/) | MEDIUM — verify feature flag name in crate docs at add time |
| unpdf 0.6.4 active, CJK/RTL | [GitHub iyulab/unpdf](https://github.com/iyulab/unpdf) | MEDIUM |
| pdf-extract weak CJK / stale | [docs.rs/pdf-extract](https://docs.rs/pdf-extract), [rust users thread](https://users.rust-lang.org/t/convert-pdf-file-to-txt-file/56664) | MEDIUM |
| docx read-crate ecosystem weak | [reddit r/rust thread](https://www.reddit.com/r/rust/comments/1lqlgb7/best_rust_library_to_create_docx_file/) | MEDIUM |
| zip/quick-xml maturity; OOXML text is UTF-8 | Training data + ecosystem consensus | HIGH |
| Exact version numbers | Web-search snapshots | MEDIUM — **re-verify on crates.io the day of implementation** |

No Context7 verification (unavailable in this session); all library findings are web-search verified — flagged MEDIUM accordingly.
