import { ElementType } from 'react';
import { Card } from '@/src/components/ui/Card';

interface PlaceholderViewProps {
  icon: ElementType;
  title: string;
  description: string;
}

export function PlaceholderView({ icon: Icon, title, description }: PlaceholderViewProps) {
  return (
    <Card variant="glass" className="flex flex-col items-center justify-center h-full min-h-[400px]">
      <div className="w-20 h-20 bg-bg-secondary rounded-full flex items-center justify-center mb-5">
        <Icon size={40} weight="duotone" className="text-text-tertiary" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary mb-2">{title}</h2>
      <p className="text-sm text-text-secondary max-w-md text-center leading-relaxed">{description}</p>
    </Card>
  );
}
