// Frontend file-name validation (fast feedback; Rust sanitize_file_name is authoritative).
export function isValidFsName(name: string): boolean {
  const n = name.trim();
  return n !== '' && !/[\\/:*?"<>|]/.test(n) && !n.includes('..');
}
