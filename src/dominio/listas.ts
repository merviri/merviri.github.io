import type { IdPersona } from "./pareja";

/**
 * Listas compartidas (compra, pelis, sitios…). Las listas van en
 * `datos/listas.json` y los elementos de cada una en su propio fichero
 * `datos/listas/<id>.json`, para que cada fichero sea pequeño y dos
 * personas tocando listas distintas no choquen nunca.
 */
export const RUTA_LISTAS = "datos/listas.json";
export const rutaElementos = (idLista: string) => `datos/listas/${idLista}.json`;

export interface Lista {
  id: string;
  nombre: string;
  emoji: string;
  orden: number;
}

export interface Elemento {
  id: string;
  texto: string;
  cantidad: string | null;
  nota: string | null;
  hecho: boolean;
  hechoPor: IdPersona | null;
  hechoEn: string | null;
  /** Menor = más arriba. Los nuevos van arriba. */
  orden: number;
}

export const PLANTILLAS: { emoji: string; nombre: string }[] = [
  { emoji: "🛒", nombre: "Compra" },
  { emoji: "🎬", nombre: "Pelis y series" },
  { emoji: "📍", nombre: "Sitios a los que ir" },
  { emoji: "🍽️", nombre: "Restaurantes por probar" },
  { emoji: "🎁", nombre: "Ideas de regalo" },
  { emoji: "🧳", nombre: "Maleta" },
];

export const EMOJIS_LISTA = ["🛒", "🎬", "📍", "🍽️", "🎁", "🧳", "📚", "🏠", "🎵", "🌱", "💡", "🧺", "🐾", "✈️", "🎲", "📝"];

export function problemaLista(nombre: string): string | null {
  const n = nombre.trim();
  if (!n) return "Ponle un nombre a la lista.";
  if (n.length > 50) return "El nombre puede tener como mucho 50 caracteres.";
  return null;
}

export function problemaElemento(texto: string): string | null {
  const t = texto.trim();
  if (!t) return "Escribe algo.";
  if (t.length > 200) return "Como mucho 200 caracteres.";
  return null;
}

/** Pendientes en su orden; hechos, el último marcado primero. */
export function ordenarElementos<T extends Elemento>(els: T[]): { pendientes: T[]; hechos: T[] } {
  const pendientes = els.filter((e) => !e.hecho).sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto, "es"));
  const hechos = els.filter((e) => e.hecho).sort((a, b) => (b.hechoEn ?? "").localeCompare(a.hechoEn ?? ""));
  return { pendientes, hechos };
}

/** Separa «2 kg de tomates» en cantidad y texto si empieza por un número. */
export function separarCantidad(entrada: string): { texto: string; cantidad: string | null } {
  const t = entrada.trim().replace(/\s+/g, " ");
  const m = /^(\d+(?:[.,]\d+)?\s?(?:kg|g|gr|l|ml|cl|uds?|paquetes?|botes?|latas?|docenas?|x)?)\s+(?:de\s+)?(.+)$/i.exec(t);
  if (m && m[2]!.length >= 2) return { cantidad: m[1]!.trim(), texto: m[2]!.trim() };
  return { texto: t, cantidad: null };
}
