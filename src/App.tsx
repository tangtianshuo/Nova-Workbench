/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar, MENU_ITEMS } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Skeleton } from './components/ui/Skeleton';
import { ToastProvider } from './components/ui/Toast';
import { TooltipProvider } from './components/ui/Tooltip';
import { AppProvider, useApp } from './store/AppContext';
import { HydrationGate } from './components/HydrationGate';
import { CmdKPalette } from './components/CmdKPalette';
import { useCmdK } from './hooks/useCmdK';
import { useUIStore } from './stores/uiStore';

// Lazy-loaded views for code splitting
const AgentWorkspaceView = lazy(() => import('./views/AgentWorkspaceView').then(m => ({ default: m.AgentWorkspaceView })));
const TaskManagementView = lazy(() => import('./views/TaskManagementView').then(m => ({ default: m.TaskManagementView })));
const ProductManagementView = lazy(() => import('./views/ProductManagementView').then(m => ({ default: m.ProductManagementView })));
const RndCenterView = lazy(() => import('./views/RndCenterView').then(m => ({ default: m.RndCenterView })));
const ScheduleView = lazy(() => import('./views/ScheduleView').then(m => ({ default: m.ScheduleView })));
const FileArchiveView = lazy(() => import('./views/FileArchiveView').then(m => ({ default: m.FileArchiveView })));
const KnowledgeBaseView = lazy(() => import('./views/KnowledgeBaseView').then(m => ({ default: m.KnowledgeBaseView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

/* View loading fallback */
function ViewLoading() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton variant="text" width="30%" />
      <Skeleton variant="rect" height={40} />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton variant="card" height={120} />
        <Skeleton variant="card" height={120} />
        <Skeleton variant="card" height={120} />
      </div>
    </div>
  );
}

function MainLayout() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const { setSelectedProductId } = useApp();

  const getHeaderInfo = () => {
    if (activeTab === 'rnd-center') {
      return {
        label: '产品研发中心',
        subtitle: 'AI 成果物生成 / 需求推导 / 交互原型 / 代码脚手架 / 测试准入'
      };
    }
    const currentItem = MENU_ITEMS.find(item => item.id === activeTab) || MENU_ITEMS[0];
    return {
      label: currentItem.label,
      subtitle: currentItem.subtitle || ''
    };
  };

  const headerInfo = getHeaderInfo();

  const handleNavigateToRnd = (productId: string) => {
    if (productId) {
      setSelectedProductId(productId);
    }
    setActiveTab('rnd-center');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'agent':
        return <AgentWorkspaceView />;
      case 'tasks':
        return <TaskManagementView />;
      case 'product-management':
        return <ProductManagementView onNavigateToRnd={handleNavigateToRnd} />;
      case 'rnd-center':
        return <RndCenterView onNavigateTab={setActiveTab} />;
      case 'schedule':
        return <ScheduleView />;
      case 'files':
        return <FileArchiveView />;
      case 'knowledge':
        return <KnowledgeBaseView />;
      case 'settings':
        return <SettingsView />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-app text-text-primary overflow-hidden">
      {/* Title Bar (Tauri drag region) */}
      <TitleBar />

      {/* Main body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} menuItems={MENU_ITEMS} />

        {/* Content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header title={headerInfo.label} subtitle={headerInfo.subtitle} />

          <main className="flex-1 overflow-auto p-6">
            <Suspense fallback={<ViewLoading />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useCmdK();

  return (
    <TooltipProvider>
      <ToastProvider>
        <AppProvider>
          <CmdKPalette />
          <HydrationGate>
            <MainLayout />
          </HydrationGate>
        </AppProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
