/** Notas compartidas: lo que no es una tarea ni una lista. */
export const RUTA_NOTAS = "datos/notas.json";

export type ColorNota = "blanco" | "rosa" | "turquesa" | "morado" | "amarillo";
export const COLORES_NOTA: ColorNota[] = ["blanco", "rosa", "turquesa", "morado", "amarillo"];

export interface Nota {
  id: string;
  titulo: string;
  texto: string;
  color: ColorNota;
  fijada: boolean;
}

export const notaVacia = (n: Pick<Nota, "titulo" | "texto">) => !n.titulo.trim() && !n.texto.trim();

/** Fijadas primero; después, la última tocada. */
export function ordenarNotas<T extends Nota & { actualizado: string }>(notas: T[]): T[] {
  return [...notas].sort((a, b) => Number(b.fijada) - Number(a.fijada) || b.actualizado.localeCompare(a.actualizado));
}

export function resumen(texto: string, max = 160): string {
  const t = texto.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export const LIMITE_NOTA = 20_000;
