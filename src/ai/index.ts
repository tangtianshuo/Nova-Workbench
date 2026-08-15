// Side-effect imports register every built-in tool exactly once per module graph.
import './tools/task';
import './tools/product';
import './tools/schedule';
import './tools/taskAdvanced';
import './tools/scheduleAdvanced';
import './tools/workspace';
import './tools/knowledgeRead';
import './tools/knowledgeWrite';
import './tools/rndAdvanced';
import './tools/knowledgeSearch';
import './tools/navigation';
import './tools/proposeMemory';

export * from './registry';
export { VIEW_IDS } from './tools/navigation';

// Keep the Phase 9 barrel usable by the loop and context consumers.
export * from './context';
export * from './toolLoop';
export * from './dateContext';
export * from './chatSession';
export * from './prompts';
