//! Workspace document ingestion (Phase 27-01): pure-Rust docx/pdf text
//! extraction, three-state mapping (extracted/partial/failed), sha2 content
//! hashing, and LLM truncation. No external processes.

use std::borrow::Cow;
use sha2::Digest;
use std::path::Path;

/// Three-state outcome per plan ING-02. failed never becomes a document.
#[derive(Debug, Clone, PartialEq)]
pub enum IngestStatus {
    Extracted,
    Partial { pages_empty: Vec<usize> },
    Failed { reason: String },
}

pub trait PdfExtractor {
    /// Per-page extracted text. Err → failed("parse_error: ...").
    fn extract_per_page(&self, path: &Path) -> Result<Vec<String>, String>;
}

pub struct OxidePdfExtractor;

impl PdfExtractor for OxidePdfExtractor {
    fn extract_per_page(&self, path: &Path) -> Result<Vec<String>, String> {
        let doc = pdf_oxide::PdfDocument::open(path)
            .map_err(|e| format!("parse_error: {e}"))?;
        let n = doc.page_count().map_err(|e| format!("parse_error: {e}"))?;
        let mut pages = Vec::with_capacity(n);
        for i in 0..n {
            // Per-page failure degrades to empty page (drives Partial/Failed),
            // never aborts the whole scan.
            pages.push(doc.extract_text(i).unwrap_or_default());
        }
        Ok(pages)
    }
}

pub fn file_sha256(path: &Path) -> Result<String, String> {
    let mut h = sha2::Sha256::new();
    let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    std::io::copy(&mut f, &mut h).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", h.finalize()))
}

pub fn extract_docx(path: &Path) -> Result<String, String> {
    let f = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(f).map_err(|_| "not_a_docx".to_string())?;
    let mut xml = zip
        .by_name("word/document.xml")
        .map_err(|_| "not_a_docx".to_string())?;
    let mut buf = Vec::new();
    std::io::Read::read_to_end(&mut xml, &mut buf).map_err(|e| e.to_string())?;
    Ok(parse_document_xml(&buf))
}

/// word/document.xml → plain text. w:p→\n, w:t unescaped text, w:tab→space,
/// w:ins kept, w:del skipped, w:tbl rows joined inline (27-RESEARCH Pattern).
fn parse_document_xml(buf: &[u8]) -> String {
    use quick_xml::events::Event;
    let mut rdr = quick_xml::Reader::from_reader(buf);
    let mut out = String::new();
    let mut in_text = false;
    let mut in_del = false;
    loop {
        match rdr.read_event() {
            Ok(Event::Start(e)) => match e.local_name().as_ref() {
                "t" => in_text = true,
                "tab" => out.push(' '),
                "p" => out.push('\n'),
                "del" => in_del = true,
                _ => {}
            },
            Ok(Event::Empty(e)) => {
                if e.local_name().as_ref() == "tab" {
                    out.push(' ');
                }
            }
            Ok(Event::Text(t)) if in_text && !in_del => {
                let raw = t.into_inner();
                out.push_str(&quick_xml::escape::unescape(raw.as_ref()).unwrap_or_default());
            }
            // quick-xml 0.42 emits entity refs (&amp; &#NNN;) as their own event.
            Ok(Event::GeneralRef(r)) if in_text && !in_del => {
                let raw = r.into_inner();
                let reconstructed = format!("&{};", raw.as_ref());
                let decoded = match quick_xml::escape::unescape(&reconstructed) {
                    Ok(d) => d,
                    Err(_) => Cow::Owned(reconstructed),
                };
                out.push_str(&decoded);
            }
            Ok(Event::End(e)) => match e.local_name().as_ref() {
                "t" => in_text = false,
                "del" => in_del = false,
                _ => {}
            },
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(_) => break, // best-effort: keep what we parsed
        }
    }
    out.trim().to_string()
}

/// Three-state mapping (ING-02). Empty page = trimmed text under 10 chars.
pub fn classify_pdf(per_page: &[String]) -> IngestStatus {
    let pages_empty: Vec<usize> = per_page
        .iter()
        .enumerate()
        .filter(|(_, t)| t.trim().chars().count() < 10)
        .map(|(i, _)| i)
        .collect();
    if pages_empty.len() == per_page.len() {
        IngestStatus::Failed { reason: "scanned_pdf_no_text_layer".into() }
    } else if pages_empty.is_empty() {
        IngestStatus::Extracted
    } else {
        IngestStatus::Partial { pages_empty }
    }
}

const MAX_LLM_CHARS: usize = 12000;

pub fn truncate_for_llm(text: &str) -> String {
    let n = text.chars().count();
    if n <= MAX_LLM_CHARS {
        return text.to_string();
    }
    let head: String = text.chars().take(MAX_LLM_CHARS - 50).collect();
    format!("{head}…(全文已存,共 {n} 字)")
}

/// scan_workspace (Task 3): walk root for .docx/.pdf (hidden dirs skipped),
/// hash each file, skip already-ingested hashes, extract + three-state the
/// rest, record non-failed results in ingested_documents (0010).
pub fn scan_workspace(root: &Path, conn: &rusqlite::Connection) -> Result<Vec<serde_json::Value>, String> {
    let mut files = Vec::new();
    collect_docs(root, &mut files)?;
    let mut items = Vec::new();
    let ws_id = root.to_string_lossy().to_string();
    for path in files {
        let hash = file_sha256(&path)?;
        // Hash hit with non-failed status → skip (ING-05).
        let hit: Option<String> = conn
            .query_row(
                "SELECT status FROM ingested_documents WHERE content_hash = ?1",
                [&hash],
                |r| r.get(0),
            )
            .ok()
            .filter(|s: &String| s != "failed");
        if let Some(prev) = hit {
            items.push(serde_json::json!({
                "path": path.to_string_lossy(), "contentHash": hash,
                "status": "skipped", "previousStatus": prev,
            }));
            continue;
        }
        let (status, reason, pages_empty, text) = match path.extension().and_then(|e| e.to_str()) {
            Some("pdf") => {
                match OxidePdfExtractor.extract_per_page(&path) {
                    Ok(pages) => match classify_pdf(&pages) {
                        IngestStatus::Extracted => ("extracted", None, None, Some(pages.join("\n"))),
                        IngestStatus::Partial { pages_empty } => {
                            ("partial", None, Some(pages_empty), Some(pages.join("\n")))
                        }
                        IngestStatus::Failed { reason } => ("failed", Some(reason), None, None),
                    },
                    Err(e) => ("failed", Some(e), None, None),
                }
            }
            Some("docx") => match extract_docx(&path) {
                Ok(text) => ("extracted", None, None, Some(text)),
                Err(reason) => ("failed", Some(reason), None, None),
            },
            _ => continue,
        };
        // failed → no hash record (D-04: rescans retry).
        if status != "failed" {
            conn.execute(
                "INSERT OR REPLACE INTO ingested_documents
                 (id, workspace_id, path, content_hash, status, reason, extracted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(),
                    ws_id,
                    path.to_string_lossy(),
                    hash,
                    status,
                    reason,
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        let mut item = serde_json::json!({
            "path": path.to_string_lossy(), "contentHash": hash, "status": status,
        });
        if let Some(r) = reason {
            item["reason"] = serde_json::json!(r);
        }
        if let Some(pe) = pages_empty {
            item["pagesEmpty"] = serde_json::json!(pe);
        }
        if let Some(t) = text {
            item["text"] = serde_json::json!(truncate_for_llm(&t));
        }
        items.push(item);
    }
    Ok(items)
}

fn collect_docs(dir: &Path, out: &mut Vec<std::path::PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    for e in entries {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            collect_docs(&p, out)?;
        } else if matches!(p.extension().and_then(|x| x.to_str()), Some("pdf") | Some("docx")) {
            out.push(p);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn fixture(name: &str) -> std::path::PathBuf {
        let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/ingest")
            .join(name);
        if !p.exists() {
            eprintln!("fixture missing, skipping: {}", p.display());
        }
        p
    }

    fn fixture_or_skip(name: &str) -> Option<std::path::PathBuf> {
        let p = fixture(name);
        p.exists().then_some(p)
    }

    #[test]
    fn chinese_pdfs_extract_expected_substrings() {
        let cases = [
            ("chinese-1.pdf", ["文档自动化审核", "验收报告", "交付用印"]),
            ("chinese-2.pdf", ["数字见证", "统筹统计分析", "领导驾驶舱"]),
        ];
        for (name, phrases) in cases {
            let Some(p) = fixture_or_skip(name) else { continue };
            let pages = OxidePdfExtractor.extract_per_page(&p).unwrap_or_else(|e| panic!("{name}: {e}"));
            assert!(!pages.is_empty(), "{name}: no pages");
            let text: String = pages.join("\n");
            for ph in phrases {
                assert!(text.contains(ph), "{name}: missing substring {ph}");
            }
            // Content present = Extracted or Partial (real docs may have a
            // blank page); must never be Failed.
            assert!(matches!(classify_pdf(&pages), IngestStatus::Extracted | IngestStatus::Partial { .. }), "{name}");
        }
    }

    #[test]
    fn scanned_pdf_fails_with_no_text_layer() {
        let Some(p) = fixture_or_skip("scanned.pdf") else { return };
        let pages = OxidePdfExtractor.extract_per_page(&p).expect("scanned pdf should parse");
        assert_eq!(
            classify_pdf(&pages),
            IngestStatus::Failed { reason: "scanned_pdf_no_text_layer".into() }
        );
    }

    #[test]
    fn classify_pdf_partial_and_empty() {
        assert_eq!(
            classify_pdf(&["正常文本很长超过十个字符的一页".into(), "  ".into()]),
            IngestStatus::Partial { pages_empty: vec![1] }
        );
        assert_eq!(
            classify_pdf(&["   ".into(), "".into()]),
            IngestStatus::Failed { reason: "scanned_pdf_no_text_layer".into() }
        );
    }

    #[test]
    fn minimal_docx_extracts_paragraphs() {
        // Build a minimal .docx in a temp dir: zip with word/document.xml.
        let dir = std::env::temp_dir().join("nova_ingest_test");
        fs::create_dir_all(&dir).unwrap();
        let docx = dir.join("minimal.docx");
        let xml = concat!(
            "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">",
            "<w:body>",
            "<w:p><w:r><w:t>第一段</w:t></w:r></w:p>",
            "<w:p><w:r><w:tab/><w:t>第二段&amp;更多</w:t></w:r></w:p>",
            "</w:body></w:document>"
        );
        let f = fs::File::create(&docx).unwrap();
        let mut w = zip::ZipWriter::new(f);
        w.start_file("word/document.xml", zip::write::SimpleFileOptions::default()).unwrap();
        std::io::Write::write_all(&mut w, xml.as_bytes()).unwrap();
        w.finish().unwrap();

        let text = extract_docx(&docx).unwrap();
        assert!(text.contains("第一段\n"), "paragraphs newline-separated: {text:?}");
        assert!(text.contains(" 第二段&更多"), "tab→space + unescape: {text:?}");

        // empty zip → not_a_docx
        let empty = dir.join("empty.docx");
        let f = fs::File::create(&empty).unwrap();
        zip::ZipWriter::new(f).finish().unwrap();
        assert_eq!(extract_docx(&empty), Err("not_a_docx".to_string()));
    }

    #[test]
    fn hash_stable_and_truncate() {
        let dir = std::env::temp_dir().join("nova_ingest_test");
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("hash.txt");
        fs::write(&p, "abc").unwrap();
        let h1 = file_sha256(&p).unwrap();
        let h2 = file_sha256(&p).unwrap();
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);

        let long = "字".repeat(15000);
        let t = truncate_for_llm(&long);
        assert!(t.chars().count() <= 12000);
        assert!(t.contains("…(全文已存,共 15000 字)"), "tail marker: {}", &t[t.len().saturating_sub(40)..]);
        let short = "短文本";
        assert_eq!(truncate_for_llm(short), short);
    }

    #[test]
    fn scan_workspace_hash_idempotency() {
        use crate::engine::db::testing::mem_conn;
        let conn = mem_conn();
        let dir = std::env::temp_dir().join(format!("nova_ingest_scan_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        // minimal docx
        let xml = "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>需求正文段落</w:t></w:r></w:p></w:body></w:document>";
        let docx = dir.join("a.docx");
        let f = fs::File::create(&docx).unwrap();
        let mut w = zip::ZipWriter::new(f);
        w.start_file("word/document.xml", zip::write::SimpleFileOptions::default()).unwrap();
        std::io::Write::write_all(&mut w, xml.as_bytes()).unwrap();
        w.finish().unwrap();
        // not_a_docx decoy
        let bad = dir.join("b.docx");
        fs::write(&bad, b"not a zip").unwrap();

        // scan 1: extracted + failed(no record)
        let items = scan_workspace(&dir, &conn).unwrap();
        assert_eq!(items.len(), 2);
        let a = items.iter().find(|i| i["path"].as_str().unwrap().ends_with("a.docx")).unwrap();
        assert_eq!(a["status"], "extracted");
        assert!(a["text"].as_str().unwrap().contains("需求正文段落"));
        let b = items.iter().find(|i| i["path"].as_str().unwrap().ends_with("b.docx")).unwrap();
        assert_eq!(b["status"], "failed");
        assert_eq!(b["reason"], "not_a_docx");

        // scan 2: same bytes → a skipped, b retried (still failed)
        let items = scan_workspace(&dir, &conn).unwrap();
        let a = items.iter().find(|i| i["path"].as_str().unwrap().ends_with("a.docx")).unwrap();
        assert_eq!(a["status"], "skipped");
        let b = items.iter().find(|i| i["path"].as_str().unwrap().ends_with("b.docx")).unwrap();
        assert_eq!(b["status"], "failed");
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ingested_documents", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "failed must not be recorded");

        // scan 3: bytes changed → re-extracted
        fs::write(&docx, {
            let xml2 = "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>变更后的正文</w:t></w:r></w:p></w:body></w:document>";
            let mut buf = std::io::Cursor::new(Vec::new());
            let mut w = zip::ZipWriter::new(&mut buf);
            w.start_file("word/document.xml", zip::write::SimpleFileOptions::default()).unwrap();
            std::io::Write::write_all(&mut w, xml2.as_bytes()).unwrap();
            w.finish().unwrap();
            buf.into_inner()
        }).unwrap();
        let items = scan_workspace(&dir, &conn).unwrap();
        let a = items.iter().find(|i| i["path"].as_str().unwrap().ends_with("a.docx")).unwrap();
        assert_eq!(a["status"], "extracted");
        assert!(a["text"].as_str().unwrap().contains("变更后的正文"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn scan_workspace_scanned_pdf_retries() {
        let Some(src) = fixture_or_skip("scanned.pdf") else { return };
        use crate::engine::db::testing::mem_conn;
        let conn = mem_conn();
        let dir = std::env::temp_dir().join(format!("nova_ingest_scan_pdf_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::copy(&src, dir.join("s.pdf")).unwrap();
        for expected in ["failed", "failed"] {
            let items = scan_workspace(&dir, &conn).unwrap();
            assert_eq!(items[0]["status"], expected);
        }
        let n: i64 = conn.query_row(
            "SELECT COUNT(*) FROM ingested_documents", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0, "scanned pdf never recorded");
        let _ = fs::remove_dir_all(&dir);
    }
}
