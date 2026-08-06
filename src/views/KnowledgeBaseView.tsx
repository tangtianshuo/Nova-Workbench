import { Book, Folder, FileText, Search, ChevronRight, Hash, Star } from 'lucide-react';
import { useState } from 'react';

export function KnowledgeBaseView() {
  const [activeDoc, setActiveDoc] = useState('doc-1');

  const docs = [
    { id: 'doc-1', title: '前端开发规范 V3.0', content: '# 前端开发规范 V3.0\n\n为了提高团队协作效率，特制定本规范。\n\n## 1. 目录结构\n- `src/components`: 共享组件\n- `src/views`: 页面视图\n- `src/hooks`: 自定义 Hooks\n\n## 2. 命名规范\n- 组件名称使用 PascalCase\n- 函数名称使用 camelCase\n- 常量使用 UPPER_SNAKE_CASE\n\n## 3. 状态管理\n优先使用 React Context 进行轻量级状态共享，复杂全局状态使用 Zustand。' },
    { id: 'doc-2', title: 'WenXiBuddy 产品白皮书', content: '# WenXiBuddy 产品白皮书\n\n## 产品愿景\n打造下一代智能化的项目协作平台。\n\n## 核心场景\n1. AI 驱动的任务拆解\n2. 智能化的项目进度预测\n3. 自动化的文档总结' },
    { id: 'doc-3', title: '新人入职指南', content: '# 新人入职指南\n\n欢迎加入！以下是你需要完成的第一周任务：\n\n- [ ] 配置开发环境\n- [ ] 阅读前端开发规范\n- [ ] 参加项目介绍会议' },
  ];

  const currentDoc = docs.find(d => d.id === activeDoc) || docs[0];

  return (
    <div className="flex bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden h-[calc(100vh-140px)] min-h-[600px]">
      {/* Sidebar Navigation */}
      <div className="w-72 border-r border-slate-100 bg-slate-50/50 flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="搜索文档..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1 text-sm">
          <div className="font-bold text-slate-400 text-xs px-3 mb-2 mt-2">快速访问</div>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <Star size={16} className="text-amber-400" />
            <span>我的收藏</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
            <Book size={16} className="text-blue-500" />
            <span>所有文档</span>
          </button>

          <div className="font-bold text-slate-400 text-xs px-3 mb-2 mt-6">知识库目录</div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer">
              <ChevronRight size={16} className="text-slate-400 rotate-90" />
              <Folder size={16} className="text-indigo-400" />
              <span className="font-medium">研发规范</span>
            </div>
            <div className="pl-9 space-y-1">
              <button 
                onClick={() => setActiveDoc('doc-1')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${activeDoc === 'doc-1' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText size={14} className={activeDoc === 'doc-1' ? 'text-blue-500' : 'text-slate-400'} />
                <span className="truncate">前端开发规范 V3.0</span>
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mt-2">
              <ChevronRight size={16} className="text-slate-400 rotate-90" />
              <Folder size={16} className="text-emerald-400" />
              <span className="font-medium">产品文档</span>
            </div>
            <div className="pl-9 space-y-1">
              <button 
                onClick={() => setActiveDoc('doc-2')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${activeDoc === 'doc-2' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText size={14} className={activeDoc === 'doc-2' ? 'text-blue-500' : 'text-slate-400'} />
                <span className="truncate">产品白皮书</span>
              </button>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mt-2">
              <ChevronRight size={16} className="text-slate-400 rotate-90" />
              <Folder size={16} className="text-amber-400" />
              <span className="font-medium">团队管理</span>
            </div>
            <div className="pl-9 space-y-1">
              <button 
                onClick={() => setActiveDoc('doc-3')}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${activeDoc === 'doc-3' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <FileText size={14} className={activeDoc === 'doc-3' ? 'text-blue-500' : 'text-slate-400'} />
                <span className="truncate">新人入职指南</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Editor/Viewer */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>空间</span>
            <ChevronRight size={14} />
            <span>研发规范</span>
            <ChevronRight size={14} />
            <span className="text-slate-800 font-medium">{currentDoc.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors">编辑</button>
            <button className="text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors">分享</button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-12">
          <div className="max-w-3xl mx-auto prose prose-slate prose-blue">
            <h1 className="text-4xl font-bold text-slate-900 mb-8">{currentDoc.title}</h1>
            <div className="text-slate-700 whitespace-pre-wrap leading-relaxed">
              {currentDoc.content.split('\n').slice(2).join('\n')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
