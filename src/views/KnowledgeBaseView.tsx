import { BookOpen, Folder, FileText, MagnifyingGlass, CaretRight, Star } from '@phosphor-icons/react';
import { useState } from 'react';
import { Card } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Separator } from '@/src/components/ui/Separator';
import { cn } from '@/src/lib/utils';

const FOLDERS = [
  { id: 'dev', name: '研发规范', color: 'text-accent', icon: Folder, children: [{ id: 'doc-1', title: '前端开发规范 V3.0' }] },
  { id: 'product', name: '产品文档', color: 'text-success', icon: Folder, children: [{ id: 'doc-2', title: '产品白皮书' }] },
  { id: 'team', name: '团队管理', color: 'text-warning', icon: Folder, children: [{ id: 'doc-3', title: '新人入职指南' }] },
];

const DOCS: Record<string, { title: string; content: string }> = {
  'doc-1': {
    title: '前端开发规范 V3.0',
    content: '为了提高团队协作效率，特制定本规范。\n\n1. 目录结构\n- src/components: 共享组件\n- src/views: 页面视图\n- src/hooks: 自定义 Hooks\n\n2. 命名规范\n- 组件名称使用 PascalCase\n- 函数名称使用 camelCase\n- 常量使用 UPPER_SNAKE_CASE\n\n3. 状态管理\n优先使用 React Context 进行轻量级状态共享，复杂全局状态使用 Zustand。',
  },
  'doc-2': {
    title: 'WenXiBuddy 产品白皮书',
    content: '产品愿景\n打造下一代智能化的项目协作平台。\n\n核心场景\n1. AI 驱动的任务拆解\n2. 智能化的项目进度预测\n3. 自动化的文档总结',
  },
  'doc-3': {
    title: '新人入职指南',
    content: '欢迎加入！以下是你需要完成的第一周任务：\n\n- [ ] 配置开发环境\n- [ ] 阅读前端开发规范\n- [ ] 参加项目介绍会议',
  },
};

export function KnowledgeBaseView() {
  const [activeDoc, setActiveDoc] = useState('doc-1');
  const currentDoc = DOCS[activeDoc] || DOCS['doc-1'];
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['dev', 'product', 'team']));

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const getFolderForDoc = (docId: string) => {
    for (const folder of FOLDERS) {
      if (folder.children.some(c => c.id === docId)) return folder.name;
    }
    return '';
  };

  return (
    <Card className="flex overflow-hidden h-[calc(100vh-140px)] min-h-[600px]">
      {/* Sidebar Navigation */}
      <div className="w-64 border-r border-border-subtle bg-bg-secondary/50 flex flex-col shrink-0">
        <div className="p-3 border-b border-border-subtle">
          <Input
            placeholder="搜索文档..."
            icon={<MagnifyingGlass size={14} weight="duotone" className="text-text-tertiary" />}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[10px] font-bold text-text-tertiary px-3 mb-1.5 mt-1 uppercase tracking-widest">快速访问</div>
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-bg-secondary hover:text-text-primary rounded-[var(--radius-sm)] text-sm font-medium transition-colors">
            <Star size={16} weight="duotone" className="text-warning" />
            我的收藏
          </button>
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-text-secondary hover:bg-bg-secondary hover:text-text-primary rounded-[var(--radius-sm)] text-sm font-medium transition-colors">
            <BookOpen size={16} weight="duotone" className="text-accent" />
            所有文档
          </button>

          <Separator className="my-3" />
          <div className="text-[10px] font-bold text-text-tertiary px-3 mb-1.5 uppercase tracking-widest">知识库目录</div>

          {FOLDERS.map(folder => (
            <div key={folder.id}>
              <button
                onClick={() => toggleFolder(folder.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-text-secondary hover:bg-bg-secondary rounded-[var(--radius-sm)] transition-colors"
              >
                <CaretRight
                  size={14}
                  weight="bold"
                  className={cn('text-text-tertiary transition-transform', expandedFolders.has(folder.id) && 'rotate-90')}
                />
                <folder.icon size={16} weight="duotone" className={folder.color} />
                <span className="text-sm font-medium">{folder.name}</span>
              </button>

              {expandedFolders.has(folder.id) && (
                <div className="pl-5 space-y-0.5">
                  {folder.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setActiveDoc(child.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors',
                        activeDoc === child.id
                          ? 'bg-accent/10 text-accent font-semibold'
                          : 'text-text-secondary hover:bg-bg-secondary'
                      )}
                    >
                      <FileText size={14} weight="duotone" className={activeDoc === child.id ? 'text-accent' : 'text-text-tertiary'} />
                      <span className="truncate">{child.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Document Viewer */}
      <div className="flex-1 flex flex-col bg-bg-primary overflow-hidden">
        <div className="h-12 border-b border-border-subtle flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-text-tertiary">
            <span>空间</span>
            <CaretRight size={12} weight="bold" />
            <span>{getFolderForDoc(activeDoc)}</span>
            <CaretRight size={12} weight="bold" />
            <span className="text-text-primary font-medium">{currentDoc.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">编辑</Button>
            <Button variant="primary" size="sm">分享</Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-text-primary mb-6 tracking-tight">{currentDoc.title}</h1>
            <div className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
              {currentDoc.content}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
