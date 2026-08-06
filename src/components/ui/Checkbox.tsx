import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { Check, Minus } from '@phosphor-icons/react';

interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  id?: string;
}

export function Checkbox({ checked, onCheckedChange, disabled, className, label, id }: CheckboxProps) {
  const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'h-4 w-4 rounded-[4px] border flex items-center justify-center',
          'transition-colors duration-fast cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-1',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          checked
            ? 'bg-accent border-accent'
            : 'bg-bg-primary border-border hover:border-text-tertiary',
          className
        )}
      >
        <CheckboxPrimitive.Indicator>
          {checked === 'indeterminate' ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <Minus size={10} weight="bold" className="text-white" />
            </motion.div>
          ) : (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 25 }}>
              <Check size={10} weight="bold" className="text-white" />
            </motion.div>
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label && (
        <label htmlFor={checkboxId} className="text-sm text-text-primary cursor-pointer select-none">
          {label}
        </label>
      )}
    </div>
  );
}
