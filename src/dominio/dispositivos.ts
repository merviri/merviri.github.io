import type { IdPersona } from "./pareja";

/** Dispositivos vinculados: quién usa cada uno, cuándo se abrió y qué token usa. */
export const RUTA_DISPOSITIVOS = "datos/dispositivos.json";

export interface Dispositivo {
  id: string;
  nombre: string;
  persona: IdPersona;
  ultimaVez: string;
  huellaToken: string;
  version: string;
}

/** Nombre por defecto según el tipo de aparato. */
export function nombrePorDefecto(nombrePersona: string, userAgent: string): string {
  const movil = /Android|iPhone|iPad|Mobile/i.test(userAgent);
  return `${movil ? "Móvil" : "Ordenador"} de ${nombrePersona}`;
}

/** Cada cuánto se actualiza «última vez» (para no llenar el historial de cambios). */
export const REFRESCO_DISPOSITIVO_MS = 3 * 60 * 60 * 1000;
