import { registerTool } from '../registry';
import { z } from 'zod';
import { useUIStore } from '../../stores/uiStore';

export const VIEW_IDS = ['agent', 'tasks', 'product-management', 'rnd-center', 'schedule', 'files', 'knowledge', 'settings'] as const;
const viewSchema = z.enum(VIEW_IDS);

function navigate(view: (typeof VIEW_IDS)[number], productId?: string) {
  const ui = useUIStore.getState();
  if (productId !== undefined) ui.setSelectedProductId(productId || null);
  ui.setActiveTab(view);
  return { ok: true, view, productId: productId || null };
}

const navigationSchema = z.object({
  view: viewSchema,
  productId: z.string().optional(),
});

registerTool({
  name: 'openView',
  description: 'Open one of Nova\'s main views, optionally selecting a product.',
  schema: navigationSchema,
  execute: (args) => navigate(args.view, args.productId),
});

registerTool({
  name: 'executeNavigation',
  description: 'Execute a validated navigation request using the current UI store.',
  schema: navigationSchema,
  execute: (args) => navigate(args.view, args.productId),
});
