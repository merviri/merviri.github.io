import { diasEntre, esFecha, mismoDiaEnAnio, type Fecha } from "./fechas";

/**
 * Vosotras: nombres, colores y desde cuándo estáis juntas.
 * p1 = Elvira (turquesa), p2 = María (rosa). Lo de las dos, morado.
 */
export const RUTA_PAREJA = "datos/pareja.json";
export const ID_PAREJA = "pareja";

export type IdPersona = "p1" | "p2";
export type Color = "turquesa" | "rosa" | "morado";

export interface Persona {
  nombre: string;
  color: Color;
}

export interface Pareja {
  id: typeof ID_PAREJA;
  personas: Record<IdPersona, Persona>;
  juntasDesde: Fecha | null;
}

export const PAREJA_INICIAL: Pareja = {
  id: ID_PAREJA,
  personas: { p1: { nombre: "Elvira", color: "turquesa" }, p2: { nombre: "María", color: "rosa" } },
  juntasDesde: null,
};

export const esIdPersona = (x: unknown): x is IdPersona => x === "p1" || x === "p2";
export const otraPersona = (p: IdPersona): IdPersona => (p === "p1" ? "p2" : "p1");

export function problemaPareja(p: Pareja): string | null {
  for (const id of ["p1", "p2"] as const) {
    const n = p.personas[id]?.nombre?.trim() ?? "";
    if (!n) return "Falta un nombre.";
    if (n.length > 40) return "Los nombres pueden tener como mucho 40 caracteres.";
  }
  if (p.juntasDesde !== null && !esFecha(p.juntasDesde)) return "La fecha no es válida.";
  return null;
}

export interface Contador {
  dias: number;
  /** Próximo aniversario: cuántos años se cumplen y cuántos días faltan (0 = hoy). */
  aniversario: { anios: number; fecha: Fecha; faltan: number };
  /** Próximo número redondo de días (cada 100). */
  hito: { dias: number; faltan: number };
}

export function contador(desde: Fecha, hoyF: Fecha): Contador | null {
  if (!esFecha(desde) || diasEntre(desde, hoyF) < 0) return null;
  const dias = diasEntre(desde, hoyF);
  const anioHoy = +hoyF.slice(0, 4);
  let fecha = mismoDiaEnAnio(desde, anioHoy);
  if (diasEntre(hoyF, fecha) < 0) fecha = mismoDiaEnAnio(desde, anioHoy + 1);
  const anios = +fecha.slice(0, 4) - +desde.slice(0, 4);
  const siguienteHito = (Math.floor(dias / 100) + 1) * 100;
  return {
    dias,
    aniversario: { anios, fecha, faltan: diasEntre(hoyF, fecha) },
    hito: { dias: siguienteHito, faltan: siguienteHito - dias },
  };
}
