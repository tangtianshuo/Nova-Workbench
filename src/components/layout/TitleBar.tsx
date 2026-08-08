import { useState, useEffect, useRef } from 'react';
import { getCurrentWindow, type Window as TauriWindow } from '@tauri-apps/api/window';
import { cn } from '@/src/lib/utils';
import { isTauri } from '@/src/lib/api';

type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

// ─── Safe Tauri Window Handle ────────────────────────────────────────────────
// Returns the Tauri WebviewWindow only when actually running inside Tauri.
// All Tauri window calls should go through this to avoid errors in web mode.

function useTauriWindow(): TauriWindow | null {
  const ref = useRef<TauriWindow | null>(null);
  if (isTauri() && !ref.current) {
    ref.current = getCurrentWindow();
  }
  return ref.current;
}

// ─── Window Control SVG Icons ────────────────────────────────────────────────

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="4.5" width="9" height="1" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="0.75" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="2.5" y="0.5" width="7" height="7" rx="0.75" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" rx="0.75" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

// ─── macOS Traffic Lights ────────────────────────────────────────────────────

function MacTrafficLights() {
  const win = useTauriWindow();

  const lightBase = cn(
    'group w-3 h-3 rounded-full flex items-center justify-center',
    'transition-all duration-150',
    'hover:scale-110 active:scale-95',
    'hover:brightness-105 hover:shadow-sm'
  );

  return (
    <div className="flex items-center gap-2 pl-3 no-drag">
      <button
        className={cn(lightBase, 'bg-[#FF5F57]')}
        onClick={() => win?.close()}
        aria-label="关闭"
      >
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M1 1L5 5M5 1L1 5" stroke="#4D0000" strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className={cn(lightBase, 'bg-[#FEBC2E]')}
        onClick={() => win?.minimize()}
        aria-label="最小化"
      >
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <rect x="0.5" y="2.5" width="5" height="0.8" rx="0.4" fill="#4D3800" />
        </svg>
      </button>
      <button
        className={cn(lightBase, 'bg-[#28C840]')}
        onClick={async () => {
          if (!win) return;
          if (await win.isMaximized()) await win.unmaximize();
          else await win.maximize();
        }}
        aria-label="全屏"
      >
        <svg width="6" height="6" viewBox="0 0 6 6" className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <path d="M0.5 2L2.5 0.5M0.5 4L2.5 5.5M5.5 2L3.5 0.5M5.5 4L3.5 5.5" stroke="#003D00" strokeWidth="0.7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

// ─── Windows Window Controls ─────────────────────────────────────────────────

function WindowsControls() {
  const win = useTauriWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!win) return;
    win.isMaximized().then(setMaximized).catch(() => {});
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized).catch(() => {});
    }).catch(() => () => {});
    return () => { unlisten.then(fn => fn()).catch(() => {}); };
  }, [win]);

  // Also listen for fullscreen changes in web mode
  useEffect(() => {
    if (win) return;
    const handler = () => setMaximized(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [win]);

  const handleMinimize = () => {
    if (win) win.minimize();
  };

  const handleToggleMaximize = () => {
    if (win) {
      win.toggleMaximize();
    } else {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    }
  };

  const handleClose = () => {
    if (win) {
      win.close();
    } else {
      window.close();
    }
  };

  const btnBase = cn(
    'flex items-center justify-center w-[46px] h-full',
    'text-text-secondary',
    'transition-colors duration-100',
    'active:bg-black/[0.08] dark:active:bg-white/[0.12]'
  );

  return (
    <div className="flex items-stretch h-full no-drag">
      <button
        onClick={handleMinimize}
        className={cn(btnBase, 'hover:bg-black/[0.06] hover:text-text-primary dark:hover:bg-white/[0.08]')}
        aria-label="最小化"
      >
        <MinimizeIcon />
      </button>

      <button
        onClick={handleToggleMaximize}
        className={cn(btnBase, 'hover:bg-black/[0.06] hover:text-text-primary dark:hover:bg-white/[0.08]')}
        aria-label={maximized ? '还原' : '最大化'}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button
        onClick={handleClose}
        className={cn(btnBase, 'hover:bg-[#E81123] hover:text-white active:bg-[#C50F1F]')}
        aria-label="关闭"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

// ─── Main TitleBar ───────────────────────────────────────────────────────────

export function TitleBar({ className }: { className?: string }) {
  const inTauri = isTauri();
  const platform = detectPlatform();

  return (
    <div
      className={cn(
        'h-[var(--titlebar-h)] flex items-center',
        'bg-bg-sidebar/80 backdrop-blur-xl',
        'border-b border-border-subtle',
        'select-none shrink-0',
        className
      )}
      // Tauri v2 drag region: drag.js checks e.target.getAttribute() on the
      // exact clicked element, so buttons (without this attr) remain clickable
      data-tauri-drag-region=""
    >
      {/* macOS: traffic lights on the left */}
      {inTauri && platform === 'macos' && <MacTrafficLights />}

      {/* Center: app name */}
      <div className="flex-1 flex items-center justify-center pointer-events-none">
        <span className="text-[11px] font-medium text-text-tertiary/70 tracking-[0.2em] uppercase">
          Nova
        </span>
      </div>

      {/* Windows / Linux / web: controls on the right */}
      {platform === 'windows' || platform === 'linux' ? (
        <WindowsControls />
      ) : null}
    </div>
  );
}
