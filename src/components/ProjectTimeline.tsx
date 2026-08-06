import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { useApp } from '../store/AppContext';

export function ProjectTimeline({ className = '' }: { className?: string }) {
  const { projects } = useApp();
  const days = [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  
  // Transform project milestones into Gantt bars (mocked mapping to days array for simplicity)
  const phases = projects.flatMap((p, i) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-700',
      'bg-indigo-100 border-indigo-300 text-indigo-700',
      'bg-emerald-100 border-emerald-300 text-emerald-700',
      'bg-purple-100 border-purple-300 text-purple-700',
      'bg-amber-100 border-amber-300 text-amber-700',
    ];
    
    // Create a single phase bar for the whole project to fit nicely
    return {
      name: p.name,
      color: colors[i % colors.length],
      start: (i * 4) % 15,
      end: ((i * 4) % 15) + (Math.random() * 5 + 5), // Mock end
      label: `${p.name} - ${p.status}`
    };
  });

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col ${className}`}>
      
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
           <div className="w-1 h-4 bg-blue-600 rounded-full"></div>
           <h2 className="text-sm font-bold text-slate-800">项目时间线</h2>
           <div className="flex items-center gap-1 ml-4 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-600 cursor-pointer">
              <CalendarIcon size={12} />
              当前进度
           </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-slate-500 cursor-pointer hover:bg-slate-50 px-2 py-1 rounded">
           周 <ChevronDown size={14} />
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto">
         <div className="min-w-[800px] h-full flex flex-col relative">
            
            {/* X Axis (Days) */}
            <div className="flex ml-[140px] mb-2 border-b border-slate-100 pb-2">
               {days.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end relative">
                     <span className={`text-[10px] font-medium ${day === 24 ? 'bg-emerald-500 text-white w-5 h-5 rounded-full flex items-center justify-center -mt-1 shadow-sm' : 'text-slate-400'}`}>
                        {day}
                     </span>
                     {/* Vertical Grid Line */}
                     <div className="absolute top-6 bottom-[-500px] w-px bg-slate-50 pointer-events-none"></div>
                  </div>
               ))}
               <div className="flex-1 text-[10px] font-medium text-blue-600 flex justify-center items-end pb-1">今天</div>
            </div>

            {/* Y Axis & Gantt Bars */}
            <div className="flex-1 flex flex-col justify-start relative pt-2 gap-4">
               {phases.map((phase, index) => (
                  <div key={index} className="flex items-center group">
                     {/* Label */}
                     <div className="w-[140px] flex items-center gap-2 shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full ${phase.color.split(' ')[0].replace('100', '500')}`}></div>
                        <span className="text-xs font-medium text-slate-600 truncate pr-2" title={phase.name}>{phase.name}</span>
                     </div>
                     
                     {/* Track */}
                     <div className="flex-1 flex relative h-8 items-center">
                        {/* Bar */}
                        <div 
                           className={`absolute h-6 rounded-md border ${phase.color} shadow-sm flex items-center px-2 text-[10px] font-semibold whitespace-nowrap overflow-hidden transition-all group-hover:brightness-95 cursor-pointer hover:z-10`}
                           style={{ 
                              left: `${(phase.start / 34) * 100}%`, 
                              width: `${((phase.end - phase.start) / 34) * 100}%` 
                           }}
                        >
                           {phase.label}
                        </div>
                     </div>
                  </div>
               ))}

               {/* Today Indicator Line */}
               <div className="absolute left-[140px] top-0 bottom-[-500px] pointer-events-none" style={{ left: `calc(140px + ${(6.5 / 24) * 100}%)` }}>
                  <div className="w-px h-full bg-emerald-400/50 border-r border-dashed border-emerald-400"></div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
