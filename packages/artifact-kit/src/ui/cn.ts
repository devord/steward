import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** The chrome's own class merger (`apps/web/app/lib/utils.ts`), same shape. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
