// src/stores/docWorkspaceStore.ts
// Phase 31 (31-02): doc workspace state — doc list / current doc / note CRUD / save chain.
// Not persisted: panel open/width lives in uiStore (31-03); doc content lives in
// knowledge_docs via knowledgeRepo (version chain = history for free).
import { create } from 'zustand';
import { getKnowledgeRepo, type KnowledgeDoc } from '@/src/ai/knowledgeRepo';
import { useRndStore } from './rndStore';
import { useUIStore } from './uiStore';

/** Main-workspace entries (D-09) always open the panel alongside the doc. */
function expandPanel() {
  if (!useUIStore.getState().docWorkspaceOpen) {
    useUIStore.getState().toggleDocWorkspace();
  }
}

/** Sentinel product_id for notes without a product owner (migration 0014 comment). */
export const GLOBAL_OWNER = '__global__';

export type SaveStatus = 'idle' | 'editing' | 'saving' | 'saved' | 'error';

interface DocWorkspaceState {
  docs: KnowledgeDoc[];
  openDocIds: string[];
  activeDocId: string | null;
  saveStatus: SaveStatus;
  lastError: string | null;
  loadDocs: () => Promise<void>;
  openDoc: (docId: string) => void;
  setActiveDoc: (docId: string) => void;
  closeDoc: (docId: string) => void;
  createNote: (title: string) => Promise<string | null>;
  saveDoc: (docId: string, content: string) => Promise<void>;
  setSaveStatus: (status: SaveStatus) => void;
}

export const useDocWorkspaceStore = create<DocWorkspaceState>((set, get) => ({
  docs: [],
  openDocIds: [],
  activeDocId: null,
  saveStatus: 'idle',
  lastError: null,

  loadDocs: async () => {
    try {
      const docs = await getKnowledgeRepo().listDocs();
      set({ docs, lastError: null });
    } catch (err) {
      set({ lastError: (err as Error).message });
    }
  },

  openDoc: (docId) => {
    expandPanel();
    // Append semantics: clicking an already-open tab just activates it (D-15).
    set((s) => ({
      openDocIds: s.openDocIds.includes(docId) ? s.openDocIds : [...s.openDocIds, docId],
      activeDocId: docId,
      saveStatus: 'idle',
      lastError: null,
    }));
  },

  setActiveDoc: (docId) => set({ activeDocId: docId, saveStatus: 'idle', lastError: null }),

  closeDoc: (docId) => {
    set((s) => {
      const idx = s.openDocIds.indexOf(docId);
      const next = s.openDocIds.filter((id) => id !== docId);
      return {
        openDocIds: next,
        // Activate left neighbor; null when no tabs remain.
        activeDocId: s.activeDocId === docId ? (next[Math.max(0, idx - 1)] ?? null) : s.activeDocId,
        saveStatus: 'idle',
        lastError: null,
      };
    });
  },

  createNote: async (title) => {
    const trimmed = title.trim() || '无标题笔记';
    try {
      const repo = getKnowledgeRepo();
      // docId: time + random suffix, stable across version-chain upserts.
      const docId = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const doc = await repo.upsertDoc({
        docId,
        productId: GLOBAL_OWNER,
        title: trimmed,
        category: 'note',
        tags: [],
        summary: '',
        content: '',
        author: 'user',
        sourceType: 'user',
        docKind: 'note',
      });
      await get().loadDocs();
      expandPanel();
      set((s) => ({
        openDocIds: s.openDocIds.includes(doc.docId) ? s.openDocIds : [...s.openDocIds, doc.docId],
        activeDocId: doc.docId,
        saveStatus: 'idle',
        lastError: null,
      }));
      return doc.docId;
    } catch (err) {
      set({ lastError: (err as Error).message, saveStatus: 'error' });
      return null;
    }
  },

  saveDoc: async (docId, content) => {
    set({ saveStatus: 'saving', lastError: null });
    try {
      const repo = getKnowledgeRepo();
      // Preserve docId/productId/docKind/title — save only rewrites content (new version row).
      const existing = get().docs.find((d) => d.docId === docId)
        ?? (await repo.listVersions(docId)).find((v) => v.supersededAt === null);
      if (!existing) throw new Error(`[docWorkspace] doc not found: ${docId}`);
      await repo.upsertDoc({
        docId: existing.docId,
        productId: existing.productId,
        title: existing.title,
        category: existing.category,
        tags: existing.tags,
        summary: existing.summary,
        content,
        author: existing.author,
        sourceType: 'user',
        docKind: existing.docKind,
      });
      await get().loadDocs();
      set({ saveStatus: 'saved' });
      // Refresh product-bucket projections (documents; notes never land there — Pitfall 5).
      const hydrate = useRndStore.getState().hydrateKnowledgeFromRepo;
      if (hydrate) await hydrate();
    } catch (err) {
      set({ saveStatus: 'error', lastError: (err as Error).message });
    }
  },

  setSaveStatus: (status) => set({ saveStatus: status }),
}));
