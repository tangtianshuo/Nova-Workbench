// ponytail: single home for platform detection + future Tauri API chokepoints.
// Phase 3 IPC adapter will live here too.

export function isTauri(): boolean {
  // __TAURI_INTERNALS__ is always injected by Tauri v2 (drag.js relies on it for IPC).
  // __TAURI__ is only available when withGlobalTauri is enabled.
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}
