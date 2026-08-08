// src/stores/storage/seedData.ts
// Per D-09. Assembles the first-run seed payload for all 6 stores.
// Reads mock data + uses store-exported helpers to avoid duplication.
import { INITIAL_PRODUCTS_DATA } from '@/src/data/mockProducts';
import { INITIAL_CATEGORIES } from '@/src/data/mockTasks';
import {
  INITIAL_REQUIREMENTS,
  INITIAL_PROTOTYPES,
  INITIAL_KNOWLEDGE_BASE,
  INITIAL_CODE_SCAFFOLDS,
  INITIAL_TEST_CASES,
  INITIAL_COMPETITOR_DATA,
} from '@/src/data/mockRndData';
import { buildInitialDeliverables } from '../rndStore';
import { INITIAL_EVENTS } from '../scheduleStore';
import { INITIAL_WORKSPACES, INITIAL_LOCAL_FILES } from '../workspaceStore';

export function buildInitialSeed(): Record<string, unknown> {
  // Build deliverables map for every seed product
  const deliverablesMap: Record<string, ReturnType<typeof buildInitialDeliverables>> = {};
  for (const p of INITIAL_PRODUCTS_DATA) {
    deliverablesMap[p.id] = buildInitialDeliverables(p);
  }

  return {
    'nova-product': { products: INITIAL_PRODUCTS_DATA },
    'nova-task': { categories: INITIAL_CATEGORIES },
    'nova-rnd': {
      requirements: INITIAL_REQUIREMENTS,
      prototypes: INITIAL_PROTOTYPES,
      knowledgeBase: INITIAL_KNOWLEDGE_BASE,
      codeScaffolds: INITIAL_CODE_SCAFFOLDS,
      testCases: INITIAL_TEST_CASES,
      competitorData: INITIAL_COMPETITOR_DATA,
      deliverables: deliverablesMap,
    },
    'nova-schedule': { events: INITIAL_EVENTS },
    'nova-workspace': {
      workspaces: INITIAL_WORKSPACES,
      localIndexedFiles: INITIAL_LOCAL_FILES,
    },
    'nova-ui': { activeTab: 'agent', selectedProductId: null },
  };
}
