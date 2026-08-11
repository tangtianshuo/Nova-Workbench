import { z } from 'zod';
import { registerTool } from '../registry';
import { useProductStore } from '../../stores/productStore';
import { useRndStore } from '../../stores/rndStore';

const MAX_DOCUMENTS = 20;
const MAX_DOCUMENT_CONTENT = 6_000;
const MAX_PRD_CONTENT = 8_000;

const productIdSchema = z.string().min(1);

function findProduct(productId: string) {
  return useProductStore.getState().products.find((product) => product.id === productId);
}

function documentSummary(document: {
  id: string;
  title: string;
  category: string;
  version: string;
  author: string;
  updatedAt: string;
  wordCount: string;
  summary: string;
  content: string;
}) {
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    version: document.version,
    author: document.author,
    updatedAt: document.updatedAt,
    wordCount: document.wordCount,
    summary: document.summary,
    content: document.content.slice(0, MAX_DOCUMENT_CONTENT),
    contentTruncated: document.content.length > MAX_DOCUMENT_CONTENT,
  };
}

const getProductDocumentContextSchema = z.object({
  productId: productIdSchema,
  documentId: productIdSchema.optional(),
}).strict();

export { getProductDocumentContextSchema };

registerTool({
  name: 'getProductDocumentContext',
  description: 'Read bounded product document context for drafting assistance. Existing product documents remain unchanged and draft-only.',
  schema: getProductDocumentContextSchema,
  execute: (args) => {
    const product = findProduct(args.productId);
    if (!product) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product was not found in the current product scope.',
          productId: args.productId,
        },
      };
    }

    const documents = args.documentId
      ? product.documents.filter((document) => document.id === args.documentId)
      : product.documents.slice(0, MAX_DOCUMENTS);

    if (args.documentId && documents.length === 0) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_DOCUMENT_NOT_FOUND',
          message: 'Product document was not found in the requested product scope.',
          productId: args.productId,
          documentId: args.documentId,
        },
      };
    }

    return {
      productId: product.id,
      product: {
        id: product.id,
        name: product.name,
        tagline: product.tagline,
        stage: product.stage,
        status: product.status,
      },
      documents: documents.map(documentSummary),
      truncated: !args.documentId && product.documents.length > MAX_DOCUMENTS,
      draftOnly: true,
      writePolicy: 'No product-document overwrite is available through this tool.',
    };
  },
});

const getPRDDraftContextSchema = z.object({
  productId: productIdSchema,
}).strict();

export { getPRDDraftContextSchema };

registerTool({
  name: 'getPRDDraftContext',
  description: 'Read the current product PRD requirement draft as bounded context. This tool never publishes or overwrites a product document.',
  schema: getPRDDraftContextSchema,
  execute: (args) => {
    const product = findProduct(args.productId);
    if (!product) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product was not found in the current product scope.',
          productId: args.productId,
        },
      };
    }

    const requirement = useRndStore.getState().getRequirementForProduct(args.productId);
    return {
      productId: product.id,
      title: requirement.title,
      version: requirement.version,
      status: requirement.status,
      updatedAt: requirement.updatedAt,
      author: requirement.author,
      businessGoal: requirement.businessGoal,
      targetAudience: requirement.targetAudience.slice(0, 20),
      coreSummary: requirement.coreSummary,
      userStories: requirement.userStories.slice(0, 50),
      useCases: requirement.useCases.slice(0, 50),
      boundaryChecks: requirement.boundaryChecks.slice(0, 50),
      prdMarkdown: requirement.prdMarkdown.slice(0, MAX_PRD_CONTENT),
      prdMarkdownTruncated: requirement.prdMarkdown.length > MAX_PRD_CONTENT,
      draftOnly: true,
      writePolicy: 'The PRD is returned as a draft context; no product-document write is performed.',
    };
  },
});

const generateDeliverableSchema = z.object({
  productId: productIdSchema,
  code: z.string().min(1),
  customPrompt: z.string().max(4_000).optional(),
}).strict();

export { generateDeliverableSchema };

registerTool({
  name: 'generateDeliverable',
  description: 'Generate one R&D deliverable through the existing store action, then return its real persisted status and content.',
  schema: generateDeliverableSchema,
  execute: async (args) => {
    if (!findProduct(args.productId)) {
      return {
        ok: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: 'Product was not found in the current product scope.',
          productId: args.productId,
        },
      };
    }

    const before = useRndStore.getState().getDeliverablesForProduct(args.productId)
      .find((deliverable) => deliverable.code === args.code);
    if (!before) {
      return {
        ok: false,
        error: {
          code: 'DELIVERABLE_NOT_FOUND',
          message: 'Deliverable code was not found in the requested product scope.',
          productId: args.productId,
          deliverableCode: args.code,
        },
      };
    }

    await useRndStore.getState().generateDeliverableAI(args.productId, args.code, args.customPrompt);
    const deliverable = useRndStore.getState().deliverables[args.productId]
      ?.find((item) => item.code === args.code);

    if (!deliverable) {
      return {
        ok: false,
        error: {
          code: 'DELIVERABLE_READBACK_FAILED',
          message: 'Deliverable generation completed without a readable store record.',
          productId: args.productId,
          deliverableCode: args.code,
        },
      };
    }

    return {
      productId: deliverable.productId,
      code: deliverable.code,
      title: deliverable.title,
      status: deliverable.status,
      content: deliverable.content,
      generatedAt: deliverable.generatedAt,
      wordCount: deliverable.wordCount,
    };
  },
});
