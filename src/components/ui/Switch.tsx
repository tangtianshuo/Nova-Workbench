import * as SwitchPrimitive from '@radix-ui/react-switch';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  id?: string;
}

export function Switch({ checked, onCheckedChange, disabled, className, label, id }: SwitchProps) {
  const switchId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-center gap-2">
      <SwitchPrimitive.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer',
          'transition-colors duration-normal',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          checked ? 'bg-accent' : 'bg-bg-tertiary',
          className
        )}
      >
        <SwitchPrimitive.Thumb asChild>
          <motion.div
            className="h-4 w-4 rounded-full bg-white shadow-shadow-xs"
            animate={{ x: checked ? 18 : 2 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </SwitchPrimitive.Thumb>
      </SwitchPrimitive.Root>
      {label && (
        <label htmlFor={switchId} className="text-sm text-text-primary cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  );
}
