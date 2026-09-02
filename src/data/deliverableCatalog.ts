// src/data/deliverableCatalog.ts
// Phase 30 (30-01, SC-4): 18 交付物 catalog 唯一真相源 = deliverables-catalog.json。
// Rust 侧 (engine/tools.rs) 通过 include_str! 读同一文件 — 换垂类只换 JSON。
import catalogJson from './deliverables-catalog.json';

export interface CatalogEntry {
  code: string;
  phase: 'requirement' | 'design' | 'dev' | 'test' | 'release';
  phaseName: string;
  title: string;
  category: string;
  format: 'markdown' | 'json' | 'sql' | 'typescript' | 'table';
  icon: string;
  summary: string;
}

export const DELIVERABLES_CATALOG = catalogJson as CatalogEntry[];
