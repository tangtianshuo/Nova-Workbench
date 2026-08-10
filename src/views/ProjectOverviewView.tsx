import { useState } from 'react';
import { Clock, DotsThree, ArrowUpRight } from '@phosphor-icons/react';
import { CardHover } from '@/src/components/ui/Card';
import { Button } from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Avatar } from '@/src/components/ui/Avatar';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { ProjectVisualizer } from '../components/ProjectVisualizer';
import { ProjectTimeline } from '../components/ProjectTimeline';
import { useApp } from '../store/AppContext';
import { ProjectCreateModal } from '../components/ProjectCreateModal';

export function ProjectOverviewView() {
  const { projects } = useApp();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col gap-5 h-full relative">
      {showModal && <ProjectCreateModal onClose={() => setShowModal(false)} />}

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[320px]">
        <div className="lg:col-span-8">
          <ProjectTimeline className="w-full h-full" />
        </div>
        <div className="lg:col-span-4">
          <ProjectVisualizer className="w-full h-full" />
        </div>
      </div>

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 flex-1">
        {projects.map((p) => (
          <CardHover key={p.id} variant="interactive" className="flex flex-col p-5">
            <div className="flex justify-between items-start mb-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-text-primary truncate">{p.name}</h3>
                <Badge
                  variant={p.status === '已延期' ? 'danger' : p.status === '已上线' ? 'success' : 'neutral'}
                  className="mt-1.5"
                >
                  {p.status}
                </Badge>
              </div>
              <Button variant="ghost" size="xs">
                <DotsThree size={16} weight="bold" />
              </Button>
            </div>

            <p className="text-sm text-text-secondary leading-relaxed mb-4 line-clamp-2">
              {p.description}
            </p>

            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-text-tertiary">项目进度</span>
                <span className="font-semibold text-text-primary">{p.progress}%</span>
              </div>
              <ProgressBar value={p.progress} />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-border-subtle mt-auto">
              <Avatar size="sm" fallback={p.owner} />
              <div className="flex items-center gap-1 text-xs text-text-tertiary">
                <Clock size={12} weight="duotone" />
                {p.deadline || '未设置'}
              </div>
            </div>
          </CardHover>
        ))}

        {/* Create new project card */}
        <button
          onClick={() => setShowModal(true)}
          className="border-2 border-dashed border-border rounded-[var(--radius-lg)] flex flex-col items-center justify-center text-text-tertiary hover:text-accent hover:border-accent/30 hover:bg-accent/5 cursor-pointer transition-all min-h-[220px] group"
        >
          <div className="w-11 h-11 rounded-full bg-bg-primary border border-border-subtle flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 group-hover:border-accent/30 transition-all">
            <ArrowUpRight size={20} weight="bold" className="rotate-[-45deg]" />
          </div>
          <span className="text-sm font-semibold">创建新项目</span>
        </button>
      </div>
    </div>
  );
}
