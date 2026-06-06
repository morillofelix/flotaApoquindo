import { Inter, Outfit } from "next/font/google";

/**
 * Inter — Fuente principal para cuerpo de texto.
 * Optimizada para legibilidad en pantalla.
 */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * Outfit — Fuente para headings y títulos.
 * Geométrica y moderna, contrasta bien con Inter.
 */
export const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
