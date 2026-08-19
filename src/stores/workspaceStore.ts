import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isTauri } from '@/src/lib/api';
import { sqliteStorage } from './storage/sqliteStorage';
import { useChatConsoleStore } from './chatConsoleStore';

export interface WorkspaceFile {
  id: string;
  name: string;
  type: 'doc' | 'code' | 'sheet' | 'pdf' | 'design' | 'archive';
  size: string;
  updatedAt: string;
  path: string;
  contentSnippet?: string;
}

export interface Workspace {
  id: string;
  name: string;
  folderPath: string;
  projectId?: string;
  projectName?: string;
  files: WorkspaceFile[];
  summary?: string;
  createdAt: string;
}

export interface LocalIndexedFile {
  id: string;
  name: string;
  folder: string;
  fullPath: string;
  size: string;
  type: 'doc' | 'code' | 'sheet' | 'pdf' | 'design' | 'archive';
  extension: string;
  updatedAt: string;
  associatedApp: string;
  isFavorite?: boolean;
}

export const INITIAL_WORKSPACES: Workspace[] = [
  {
    id: 'ws-1',
    name: 'WenXiBuddy 核心研发工作区',
    folderPath: 'D:\\Projects\\WenXiBuddy\\workspace',
    projectId: 'p1',
    projectName: 'WenXiBuddy AI 智能协同平台',
    createdAt: '2025-05-10',
    summary: '',
    files: [
      {
        id: 'f-1',
        name: 'PRD_核心业务需求规格说明书_v3.2.docx',
        type: 'doc',
        size: '2.8 MB',
        updatedAt: '2025-05-18 14:30',
        path: 'D:\\Projects\\WenXiBuddy\\workspace\\docs\\PRD_核心业务需求规格说明书_v3.2.docx',
        contentSnippet: '涵盖Q3版本核心业务逻辑、权限体系重构、数据指标报表及智能AI协同工作流定义。'
      },
      {
        id: 'f-2',
        name: 'System_Architecture_Topology.pdf',
        type: 'pdf',
        size: '4.5 MB',
        updatedAt: '2025-05-16 11:20',
        path: 'D:\\Projects\\WenXiBuddy\\workspace\\arch\\System_Architecture_Topology.pdf',
        contentSnippet: '微服务架构拓扑、高可用容灾方案、数据缓存层与消息队列流转图谱。'
      }
    ]
  }
];

export const INITIAL_LOCAL_FILES: LocalIndexedFile[] = [
  {
    id: 'lf-1', name: 'PRD_核心业务需求规格说明书_v3.2.docx',
    folder: 'D:\\Projects\\WenXiBuddy\\workspace\\docs',
    fullPath: 'D:\\Projects\\WenXiBuddy\\workspace\\docs\\PRD_核心业务需求规格说明书_v3.2.docx',
    size: '2.8 MB', type: 'doc', extension: '.docx', updatedAt: '2025-05-18 14:30',
    associatedApp: 'Microsoft Word', isFavorite: true
  },
  {
    id: 'lf-2', name: 'System_Architecture_Topology.pdf',
    folder: 'D:\\Projects\\WenXiBuddy\\workspace\\arch',
    fullPath: 'D:\\Projects\\WenXiBuddy\\workspace\\arch\\System_Architecture_Topology.pdf',
    size: '4.5 MB', type: 'pdf', extension: '.pdf', updatedAt: '2025-05-16 11:20',
    associatedApp: 'Adobe Acrobat', isFavorite: true
  },
  {
    id: 'lf-3', name: 'openapi_spec_v2.json',
    folder: 'D:\\Projects\\WenXiBuddy\\workspace\\api',
    fullPath: 'D:\\Projects\\WenXiBuddy\\workspace\\api\\openapi_spec_v2.json',
    size: '340 KB', type: 'code', extension: '.json', updatedAt: '2025-05-15 09:45',
    associatedApp: 'VS Code'
  },
  {
    id: 'lf-4', name: 'Brand_Design_System_v2.fig',
    folder: 'D:\\Projects\\BrandPortal\\assets',
    fullPath: 'D:\\Projects\\BrandPortal\\assets\\Brand_Design_System_v2.fig',
    size: '18.6 MB', type: 'design', extension: '.fig', updatedAt: '2025-05-17 16:15',
    associatedApp: 'Figma', isFavorite: true
  },
  {
    id: 'lf-5', name: '自动化测试用例覆盖率报告_Sprint12.xlsx',
    folder: 'D:\\Projects\\WenXiBuddy\\workspace\\qa',
    fullPath: 'D:\\Projects\\WenXiBuddy\\workspace\\qa\\自动化测试用例覆盖率报告_Sprint12.xlsx',
    size: '1.2 MB', type: 'sheet', extension: '.xlsx', updatedAt: '2025-05-12 17:00',
    associatedApp: 'Microsoft Excel'
  }
];

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  localIndexedFiles: LocalIndexedFile[];

  setActiveWorkspaceId: (id: string) => { success: boolean; reason?: string };
  addWorkspace: (workspace: Workspace) => void;
  updateWorkspace: (id: string, updates: Partial<Workspace>) => void;
  deleteWorkspace: (id: string) => void;
  unlinkProjectWorkspaces: (projectId: string) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;

  addLocalIndexedFile: (file: LocalIndexedFile) => void;
  setLocalIndexedFiles: (files: LocalIndexedFile[]) => void;

  scanWorkspaceFiles: (workspaceId: string) => Promise<void>;

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: boolean;
  _setHydrated: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
  workspaces: INITIAL_WORKSPACES,
  activeWorkspaceId: INITIAL_WORKSPACES[0]?.id ?? null,
  localIndexedFiles: INITIAL_LOCAL_FILES,

  // SESS-04: workspace switch is store-guarded (no cross-session event
  // streaming) and session-ending (CONTEXT locked decision: workspace switch
  // = end current session, enter new session).
  setActiveWorkspaceId: (id) => {
    if (id === get().activeWorkspaceId) return { success: true };
    if (useChatConsoleStore.getState().loading) return { success: false, reason: 'streaming' };
    set({ activeWorkspaceId: id });
    return useChatConsoleStore.getState().startNewSession();
  },

  addWorkspace: (workspace) =>
    set((state) => {
      if (state.workspaces.some((w) => w.id === workspace.id)) return state;
      return { workspaces: [workspace, ...state.workspaces] };
    }),

  updateWorkspace: (id, updates) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === id ? { ...w, ...updates } : w
      ),
    })),

  deleteWorkspace: (id) =>
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== id),
    })),

  unlinkProjectWorkspaces: (projectId) =>
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.projectId === projectId
          ? { ...w, projectId: undefined, projectName: undefined }
          : w
      ),
    })),

  setWorkspaces: (workspaces) => set({ workspaces }),

  addLocalIndexedFile: (file) =>
    set((state) => ({ localIndexedFiles: [file, ...state.localIndexedFiles] })),

  setLocalIndexedFiles: (files) => set({ localIndexedFiles: files }),

  scanWorkspaceFiles: async (workspaceId) => {
    if (!isTauri()) return; // web dev keeps mock files
    const store = useWorkspaceStore.getState();
    const ws = store.workspaces.find((w) => w.id === workspaceId);
    if (!ws?.folderPath) return;
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      const result = await invoke<{
        files: Array<{ id: string; name: string; fileType: string; size: string; updatedAt: string; path: string }>;
        truncated: boolean;
      }>('scan_workspace_folder', { folderPath: ws.folderPath });
      useWorkspaceStore.getState().updateWorkspace(workspaceId, {
        files: result.files.map((f) => ({ ...f, type: f.fileType as WorkspaceFile['type'] })),
      });
      if (result.truncated) console.warn('工作区文件扫描已截断(>1000 文件或 >6 层)');
    } catch (e) {
      console.error('scan_workspace_folder failed:', e);
    }
  },

  // ── Persistence ────────────────────────────────────────────────────────
  _hasHydrated: false,
  _setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'nova-workspace',
      version: 1,
      storage: sqliteStorage,
      partialize: (s) => ({
        workspaces: s.workspaces,
        activeWorkspaceId: s.activeWorkspaceId,
        localIndexedFiles: s.localIndexedFiles,
      }),
      migrate: (persisted, _version) => persisted as Partial<WorkspaceState>,
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);
