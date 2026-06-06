import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases CSS de forma inteligente.
 * Usa clsx para merge condicional y tailwind-merge para resolver conflictos de Tailwind.
 *
 * @example
 * cn("px-4 py-2", isActive && "bg-brand-500", className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
