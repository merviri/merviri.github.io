import type { IdPersona } from "./pareja";

/**
 * Dibujos para la otra. Cada dibujo tiene:
 *  - su ficha en `datos/dibujos.json` (para quién, fondo, cuándo);
 *  - sus trazos en `datos/dibujos/<id>.json` (puntos enteros en un lienzo
 *    de 900×1600, en diferencias para que ocupen poco);
 *  - una «reacción» por persona en `datos/reacciones.json` (visto y ❤️),
 *    separada para que lo que hace cada una nunca pise lo de la otra.
 */
export const RUTA_DIBUJOS = "datos/dibujos.json";
export const RUTA_REACCIONES = "datos/reacciones.json";
export const rutaTrazos = (id: string) => `datos/dibujos/${id}.json`;
export const ID_TRAZOS = "trazos";

export const ANCHO = 900;
export const ALTO = 1600;
export const MAX_PUNTOS = 30_000;

export type Destino = IdPersona | "ambas";

export interface Dibujo {
  id: string;
  para: Destino;
  fondo: string;
  respondeA: string | null;
}

export interface Trazo {
  /** Color. */
  c: string;
  /** Grosor en unidades del lienzo. */
  g: number;
  /** Primer punto absoluto y luego diferencias: x0, y0, dx1, dy1… */
  p: number[];
}

export interface TrazosDibujo {
  id: typeof ID_TRAZOS;
  trazos: Trazo[];
}

export interface Reaccion {
  id: string;
  dibujo: string;
  persona: IdPersona;
  visto: string | null;
  megusta: boolean;
}

export const COLORES_DIBUJO = ["#2B1E27", "#D4537E", "#17B3B0", "#534AB7", "#F2B630", "#E4572E", "#3BA55C", "#FFFFFF"];
export const FONDOS_DIBUJO = ["#FFFFFF", "#FBEAF0", "#DDF6F5", "#EEEDFE", "#FFF4D6", "#17111A"];
export const GROSORES = [6, 14, 30];

export const idReaccion = (dibujo: string, persona: IdPersona) => `${dibujo}:${persona}`;

const limitar = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

export function codificarPuntos(puntos: [number, number][]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  puntos.forEach(([x, y], i) => {
    const cx = limitar(x, ANCHO);
    const cy = limitar(y, ALTO);
    if (i === 0) out.push(cx, cy);
    else out.push(cx - px, cy - py);
    px = cx;
    py = cy;
  });
  return out;
}

export function decodificarPuntos(p: number[]): [number, number][] {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < p.length; i += 2) {
    x = i === 0 ? p[i]! : x + p[i]!;
    y = i === 0 ? p[i + 1]! : y + p[i + 1]!;
    out.push([x, y]);
  }
  return out;
}

export function esParaMi(d: Dibujo & { por: string }, yo: IdPersona): boolean {
  return d.por !== yo && (d.para === yo || d.para === "ambas");
}

/** Dibujos para mí que todavía no he visto (el más nuevo primero). */
export function sinVer<D extends Dibujo & { por: string; actualizado: string }>(
  dibujos: D[], reacciones: Reaccion[], yo: IdPersona,
): D[] {
  const vistos = new Set(reacciones.filter((r) => r.persona === yo && r.visto).map((r) => r.dibujo));
  return dibujos.filter((d) => esParaMi(d, yo) && !vistos.has(d.id)).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

export const contarPuntos = (trazos: Trazo[]) => trazos.reduce((n, t) => n + t.p.length / 2, 0);
