import type { FestivoLocal } from "../dominio/festivos";

/**
 * Fiestas locales de Valladolid desde los datos abiertos de la Junta de
 * Castilla y León (permite CORS; ya está en la CSP). Se guardan en el
 * navegador y se vuelven a pedir como mucho una vez por semana.
 */
const BASE = "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/fiestas-locales-calendario-de-fiestas-de-caracter-local/records";
export const INE_VALLADOLID = 47186;
const CLAVE = "merviri:festivos-locales";
const UNA_SEMANA = 7 * 24 * 3600 * 1000;

/** Se lee del navegador la primera vez que hace falta. */
let enMemoria: FestivoLocal[] | null = null;

function leerCache(): { ts: number; datos: FestivoLocal[] } | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as { ts: number; datos: FestivoLocal[] } | null;
    return c && Array.isArray(c.datos) ? c : null;
  } catch {
    return null;
  }
}

/** Lo último que se descargó (vacío si nunca). */
export const festivosLocales = (): FestivoLocal[] => (enMemoria ??= leerCache()?.datos ?? []);

/** Convierte la respuesta de la API (se ignora lo que no tenga forma de festivo). */
export function leerRespuesta(json: unknown): FestivoLocal[] {
  const filas = (json as { results?: unknown[] })?.results;
  if (!Array.isArray(filas)) return [];
  return filas.flatMap((r) => {
    const f = (r as { fecha_fiesta?: unknown }).fecha_fiesta;
    const n = (r as { nombre_fiesta?: unknown }).nombre_fiesta;
    return typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.slice(0, 10)) && typeof n === "string" && n.trim()
      ? [{ fecha: f.slice(0, 10), nombre: n.trim().slice(0, 80) }] : [];
  });
}

/** Descarga los festivos locales si hace falta. Devuelve true si han cambiado. */
export async function actualizarFestivosLocales(fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<boolean> {
  const c = leerCache();
  if (c && Date.now() - c.ts < UNA_SEMANA) return false;
  const url = new URL(BASE);
  url.searchParams.set("where", `ine=${INE_VALLADOLID}`);
  url.searchParams.set("select", "fecha_fiesta,nombre_fiesta");
  url.searchParams.set("order_by", "fecha_fiesta");
  url.searchParams.set("limit", "100");
  const res = await fetchImpl(url.toString());
  if (!res.ok) throw new Error(`Festivos locales: ${res.status}`);
  const datos = leerRespuesta(await res.json());
  // Si la respuesta llega vacía, no se pisa lo que ya había.
  if (!datos.length) return false;
  const antes = JSON.stringify(festivosLocales());
  enMemoria = datos;
  try { localStorage.setItem(CLAVE, JSON.stringify({ ts: Date.now(), datos })); } catch { /* sin almacenamiento */ }
  return JSON.stringify(datos) !== antes;
}
