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
}
