// ponytail: single home for platform detection + future Tauri API chokepoints.
// Phase 3 IPC adapter will live here too.

export function isTauri(): boolean {
  // __TAURI_INTERNALS__ is always injected by Tauri v2 (drag.js relies on it for IPC).
  // __TAURI__ is only available when withGlobalTauri is enabled.
  // ponytail: typeof window check is the stdlib SSR guard — covers Node test envs
  // and any future SSR boundary without a second isTauri variant.
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}
