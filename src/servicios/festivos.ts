import type { FestivoLocal } from "../dominio/festivos";

/**
 * Fiestas locales de vuestro municipio, desde los datos abiertos regionales
 * (conjunto «Fiestas locales: calendario de fiestas de carácter local»; el
 * código INE del municipio está en `zona.json`, no en el código). Se guardan
 * en el navegador y se vuelven a pedir como mucho una vez por semana.
 */
const BASE = "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/fiestas-locales-calendario-de-fiestas-de-caracter-local/records";
const CLAVE = "merviri:festivos-locales";
const UNA_SEMANA = 7 * 24 * 3600 * 1000;

interface Cache { ine?: number; ts: number; datos: FestivoLocal[] }

/** Se lee del navegador la primera vez que hace falta. */
let enMemoria: Cache | null = null;

function leerCache(): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Cache | null;
    return c && Array.isArray(c.datos) ? c : null;
  } catch {
    return null;
  }
}

/** Lo último que se descargó para ese municipio (vacío si nunca). */
export function festivosLocales(ine: number | null | undefined): FestivoLocal[] {
  if (!ine) return [];
  enMemoria ??= leerCache() ?? { ts: 0, datos: [] };
  return enMemoria.ine === ine ? enMemoria.datos : [];
}

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

/** Descarga los festivos locales del municipio si hace falta. Devuelve true si han cambiado. */
export async function actualizarFestivosLocales(ine: number, fetchImpl: typeof fetch = fetch.bind(globalThis)): Promise<boolean> {
  const c = leerCache();
  if (c && c.ine === ine && Date.now() - c.ts < UNA_SEMANA) return false;
  const url = new URL(BASE);
  url.searchParams.set("where", `ine=${Math.trunc(ine)}`);
  url.searchParams.set("select", "fecha_fiesta,nombre_fiesta");
  url.searchParams.set("order_by", "fecha_fiesta");
  url.searchParams.set("limit", "100");
  const res = await fetchImpl(url.toString(), { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`Festivos locales: ${res.status}`);
  const datos = leerRespuesta(await res.json());
  // Si la respuesta llega vacía, no se pisa lo que ya había.
  if (!datos.length) return false;
  const antes = JSON.stringify(festivosLocales(ine));
  enMemoria = { ine, ts: Date.now(), datos };
  try { localStorage.setItem(CLAVE, JSON.stringify(enMemoria)); } catch { /* sin almacenamiento */ }
  return JSON.stringify(datos) !== antes;
}
