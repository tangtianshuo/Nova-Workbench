import { ElementType } from 'react';

interface PlaceholderViewProps {
  icon: ElementType;
  title: string;
  description: string;
}

export function PlaceholderView({ icon: Icon, title, description }: PlaceholderViewProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
        <Icon size={48} className="text-slate-300" />
      </div>
      <h2 className="text-xl font-bold text-slate-700 mb-2">{title}</h2>
      <p className="text-sm text-slate-500 max-w-md text-center">{description}</p>
    </div>
  );
}
