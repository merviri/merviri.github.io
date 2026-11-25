import type { FestivoLocal } from "./festivos";
import type { FechaEspecial, Idea } from "./ideas";

/**
 * La zona donde vivís: ciudad (y sus coordenadas para el tiempo), provincia
 * (agenda cultural), municipio (fiestas locales), festivos de la comunidad,
 * sitios cercanos e ideas y fechas de la zona.
 *
 * No va en el código, que es público: está en `zona.json`, en la raíz del
 * repositorio privado de datos. Va sin cifrar porque solo tiene información
 * pública de la ciudad y así se pueden añadir los festivos de cada año sin
 * pasar por la app; solo lo ve quien tiene acceso al repositorio. Cada
 * dispositivo guarda una copia (cifrada) para cuando no hay conexión.
 */
export const RUTA_ZONA = "zona.json";

export type TipoSitio = "castillo" | "mirador" | "naturaleza" | "museo" | "pueblo";

export interface SitioZona {
  id: string;
  nombre: string;
  tipo: TipoSitio;
  lat: number;
  lon: number;
}

export interface Zona {
  version: 1;
  ciudad: { nombre: string; lat: number; lon: number };
  /** Para la agenda cultural (datos abiertos). */
  provincia: string | null;
  /** Código INE del municipio, para sus dos fiestas locales. */
  municipioIne: number | null;
  /** Solo para los textos (p. ej., «Festivos de la comunidad»). */
  comunidad: string | null;
  /** De dónde salen los festivos (para recordar dónde buscar los del año siguiente). */
  fuenteFestivos: string | null;
  /** Festivos de la comunidad por año: «MM-DD» y nombre (con los traslados a lunes). */
  festivos: Record<string, [string, string][]>;
  /** Fiestas locales ya conocidas (por si no se pueden descargar). */
  localesReserva: FestivoLocal[];
  ideas: Idea[];
  fechasEspeciales: FechaEspecial[];
  sitios: SitioZona[];
}

const esNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const texto = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const lista = <T>(x: unknown, valido: (y: unknown) => boolean): T[] => (Array.isArray(x) ? (x.filter(valido) as T[]) : []);

/** Lee y comprueba `zona.json` (lo que no tenga forma se ignora; null si falta lo básico). */
export function leerZona(x: unknown): Zona | null {
  if (!x || typeof x !== "object") return null;
  const z = x as Record<string, unknown>;
  const c = z.ciudad as Record<string, unknown> | undefined;
  const nombre = texto(c?.nombre);
  if (!c || !nombre || !esNumero(c.lat) || !esNumero(c.lon) || Math.abs(c.lat) > 90 || Math.abs(c.lon) > 180) return null;
  const festivos: Record<string, [string, string][]> = {};
  if (z.festivos && typeof z.festivos === "object") {
    for (const [anio, l] of Object.entries(z.festivos as Record<string, unknown>)) {
      if (!/^\d{4}$/.test(anio)) continue;
      festivos[anio] = lista<[string, string]>(l, (y) => Array.isArray(y) && /^\d{2}-\d{2}$/.test(String(y[0])) && typeof y[1] === "string");
    }
  }
  return {
    version: 1,
    ciudad: { nombre, lat: c.lat, lon: c.lon },
    provincia: texto(z.provincia),
    municipioIne: esNumero(z.municipioIne) ? z.municipioIne : null,
    comunidad: texto(z.comunidad),
    fuenteFestivos: texto(z.fuenteFestivos),
    festivos,
    localesReserva: lista<FestivoLocal>(z.localesReserva, (y) => !!y && typeof (y as FestivoLocal).fecha === "string" && typeof (y as FestivoLocal).nombre === "string"),
    ideas: lista<Idea>(z.ideas, (y) => !!y && typeof (y as Idea).id === "string" && typeof (y as Idea).titulo === "string"),
    fechasEspeciales: lista<FechaEspecial>(z.fechasEspeciales, (y) => !!y && typeof (y as FechaEspecial).id === "string" && typeof (y as FechaEspecial).titulo === "string"),
    sitios: lista<SitioZona>(z.sitios, (y) => !!y && typeof (y as SitioZona).nombre === "string" && esNumero((y as SitioZona).lat) && esNumero((y as SitioZona).lon)),
  };
}
