import { z } from 'zod';
import { registerTool } from '../registry';
import { useRndStore } from '../../stores/rndStore';

registerTool({
  name: 'readKnowledgeArticle',
  description: 'Read one product knowledge article within the requested product scope.',
  schema: z.object({
    productId: z.string().min(1),
    itemId: z.string().min(1),
  }),
  execute: (args) => {
    const article = useRndStore.getState().knowledgeBase[args.productId]
      ?.find((item) => item.id === args.itemId);

    if (!article) {
      return {
        ok: false,
        error: {
          code: 'KNOWLEDGE_ARTICLE_NOT_FOUND',
          message: 'Knowledge article was not found in the requested product scope.',
          productId: args.productId,
          itemId: args.itemId,
        },
      };
    }

    return { article: { ...article } };
  },
});
