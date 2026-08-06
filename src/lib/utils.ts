import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with conflict resolution.
 * Activates the previously-installed clsx + tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Conditionally apply a class when a boolean is true.
 */
export function when(condition: boolean, className: string) {
  return condition ? className : '';
}
