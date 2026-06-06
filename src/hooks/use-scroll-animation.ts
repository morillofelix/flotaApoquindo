"use client";

import { useRef } from "react";
import { useInView, type UseInViewOptions } from "motion/react";

interface UseScrollAnimationOptions {
  /** Margen del viewport para disparar la animación (CSS margin syntax) */
  margin?: UseInViewOptions["margin"];
  /** Si la animación debe ejecutarse solo una vez */
  once?: boolean;
  /** Porción del elemento que debe ser visible (0-1) */
  amount?: UseInViewOptions["amount"];
}

/**
 * Hook para detectar cuando un elemento entra en el viewport.
 * Retorna una ref para adjuntar al elemento y un booleano indicando visibilidad.
 *
 * @example
 * const { ref, isInView } = useScrollAnimation();
 * <motion.div ref={ref} animate={isInView ? { opacity: 1 } : { opacity: 0 }} />
 */
export function useScrollAnimation<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollAnimationOptions = {}
) {
  const { margin = "-100px", once = true, amount = 0.3 } = options;
  const ref = useRef<T>(null);
  const isInView = useInView(ref, { margin, once, amount });

  return { ref, isInView };
}
