import { useState } from 'react';
import { MoreHorizontal, Clock, ArrowRight } from 'lucide-react';
import { ProjectVisualizer } from '../components/ProjectVisualizer';
import { ProjectTimeline } from '../components/ProjectTimeline';
import { useApp } from '../store/AppContext';
import { ProjectCreateModal } from '../components/ProjectCreateModal';

export function ProjectOverviewView() {
  const { projects } = useApp();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col gap-6 h-full relative">
      {showModal && <ProjectCreateModal onClose={() => setShowModal(false)} />}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[360px]">
        <div className="lg:col-span-8">
          <ProjectTimeline className="w-full h-full" />
        </div>
        <div className="lg:col-span-4">
          <ProjectVisualizer className="w-full h-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 flex-1">
        {projects.map((p, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col">
           <div className="flex justify-between items-start mb-4">
             <div>
               <h3 className="text-lg font-bold text-slate-800">{p.name}</h3>
               <span className={`inline-block mt-2 px-2 py-1 text-xs font-medium rounded-md ${p.status === '已延期' ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-600'}`}>{p.status}</span>
             </div>
             <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={20} /></button>
           </div>
           
           <div className="mb-6 flex-1 text-sm text-slate-600">
             {p.description}
           </div>

           <div className="mb-6">
             <div className="flex justify-between text-sm mb-2">
               <span className="text-slate-500">项目进度</span>
               <span className="font-bold text-slate-700">{p.progress}%</span>
             </div>
             <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.progress}%` }}></div>
             </div>
           </div>

           <div className="flex justify-between items-center pt-4 border-t border-slate-50 mt-auto">
             <div className="flex -space-x-2">
               <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">AI</div>
             </div>
             <div className="flex items-center gap-1 text-sm text-slate-500">
               <Clock size={14} />
               {p.deadline || '未设置'}
             </div>
           </div>
        </div>
      ))}
      
      <div 
        onClick={() => setShowModal(true)}
        className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors min-h-[240px]"
      >
        <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
          <ArrowRight size={24} className="rotate-[-45deg]" />
        </div>
        <span className="font-bold">创建新项目</span>
      </div>
    </div>
    </div>
  );
}
