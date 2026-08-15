// src/ai/paramsHash.ts
// Phase 14 (EVT-05) — params_hash = SHA-256 of canonicalized JSON. Canonical form:
// object keys sorted lexicographically at every depth; array order PRESERVED (tag
// order is significant, matching the old sameDraft positional comparison);
// undefined object values dropped (JSON.stringify parity). Hashing uses WebCrypto
// (globalThis.crypto.subtle) which exists in both the Tauri webview and Node >= 19,
// keeping the dual-impl testable without Tauri.

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return JSON.stringify(value);
  }
  if (type !== 'object') return 'null'; // function/symbol/bigint cannot appear in tool args
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`);
  return `{${parts.join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function computeParamsHash(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonStringify(value));
}
