import { ArrowRight } from '@phosphor-icons/react';
import { useApp } from '../store/AppContext';
import { Card } from '@/src/components/ui/Card';

export function ProjectVisualizer({ className = '' }: { className?: string }) {
  const { projects } = useApp();

  const avgProgress = projects.length > 0
    ? Math.round(projects.reduce((acc, p) => acc + p.progress, 0) / projects.length)
    : 0;

  return (
    <Card className={`relative overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: 'linear-gradient(135deg, hsl(211 100% 96%), hsl(180 40% 94%))' }}
    >
      {/* Background Decorative Rings */}
      <div className="absolute w-[400px] h-[400px] rounded-full border border-accent/15 -top-20 -right-20" />
      <div className="absolute w-[300px] h-[300px] rounded-full border border-success/15 bottom-10 -left-10" />

      <div className="relative w-full h-full flex items-center justify-center perspective-1000">
        {/* Layer 1 - Deepest */}
        <div className="absolute" style={{ transform: 'perspective(1000px) rotateX(60deg) rotateZ(-30deg) translate3d(40px, 80px, -100px)' }}>
          <div className="bg-bg-glass backdrop-blur-md rounded-[var(--radius-lg)] shadow-lg border border-white/60 w-64 h-40 flex items-center justify-center transition-transform duration-500 hover:-translate-y-4 cursor-pointer group">
            <span className="text-text-tertiary font-bold opacity-50 group-hover:opacity-100 group-hover:text-accent transition-all">项目归档</span>
          </div>
        </div>

        {/* Layer 2 */}
        <div className="absolute" style={{ transform: 'perspective(1000px) rotateX(60deg) rotateZ(-30deg) translate3d(20px, 40px, -50px)' }}>
          <div className="bg-bg-glass backdrop-blur-md rounded-[var(--radius-lg)] shadow-xl border border-white/70 w-64 h-40 flex items-center justify-center transition-transform duration-500 hover:-translate-y-4 cursor-pointer group">
            <span className="text-text-secondary font-bold opacity-70 group-hover:opacity-100 group-hover:text-accent transition-all">开发测试</span>
          </div>
        </div>

        {/* Layer 3 - Topmost Active */}
        <div className="absolute" style={{ transform: 'perspective(1000px) rotateX(60deg) rotateZ(-30deg) translate3d(0, 0, 0)' }}>
          <div className="bg-gradient-to-tr from-success/80 to-accent/80 backdrop-blur-xl rounded-[var(--radius-lg)] shadow-2xl border border-white/40 w-64 h-40 p-5 flex flex-col justify-between hover:-translate-y-4 transition-transform duration-500 cursor-pointer">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-white font-bold text-lg drop-shadow-md">活跃项目</h3>
                <p className="text-white/80 text-xs mt-1">共 {projects.length} 个</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white backdrop-blur-md">
                <ArrowRight size={16} weight="bold" />
              </div>
            </div>
            <div className="flex items-end justify-between">
              <div className="text-4xl font-black text-white drop-shadow-lg tracking-tighter">
                {avgProgress}<span className="text-2xl">%</span>
              </div>
              <span className="text-white/90 text-sm font-medium">总体进度</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating labels */}
      <div className="absolute left-5 top-5">
        <div className="bg-bg-glass backdrop-blur-sm px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-bold text-text-primary shadow-xs">
          阶段总览
        </div>
      </div>
    </Card>
  );
}
