import { registerTool } from '../registry';
import { z } from 'zod';
import { useProductStore } from '../../stores/productStore';

registerTool({
  name: 'listProducts',
  description: 'List all products with their current stage and status.',
  schema: z.object({}),
  execute: () => useProductStore.getState().products.map((product) => ({
    id: product.id,
    name: product.name,
    tagline: product.tagline,
    stage: product.stage,
    status: product.status,
  })),
});

registerTool({
  name: 'getProductDetails',
  description: 'Get the full product record, including milestones and associated documents.',
  schema: z.object({ productId: z.string().min(1) }),
  execute: (args) => {
    const product = useProductStore.getState().products.find((item) => item.id === args.productId);
    return product ? { ...product } : { error: 'Product not found', productId: args.productId };
  },
});
