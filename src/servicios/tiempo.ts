import type { Fecha } from "../dominio/fechas";
import type { Prevision } from "../dominio/recomendar";

/**
 * Tiempo previsto (Open-Meteo: gratis, sin cuenta ni clave). Solo se envían
 * las coordenadas del sitio del plan (o de Valladolid), nada vuestro.
 * https://open-meteo.com/en/docs
 */
export const VALLADOLID = { nombre: "Valladolid", lat: 41.6523, lon: -4.7245 };

const cache = new Map<string, { cuando: number; datos: Map<Fecha, Prevision> }>();
const VIDA_MS = 60 * 60 * 1000;

const clave = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

export async function prevision(lat: number, lon: number): Promise<Map<Fecha, Prevision>> {
  const k = clave(lat, lon);
  const c = cache.get(k);
  if (c && Date.now() - c.cuando < VIDA_MS) return c.datos;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FMadrid&forecast_days=14";
  const res = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`No se pudo consultar el tiempo (${res.status}).`);
  const j = (await res.json()) as {
    daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: (number | null)[] };
  };
  const datos = new Map<Fecha, Prevision>();
  const d = j.daily;
  if (d) {
    d.time.forEach((fecha, i) => {
      datos.set(fecha, {
        fecha, codigo: d.weather_code[i] ?? 0, max: Math.round(d.temperature_2m_max[i] ?? 0), min: Math.round(d.temperature_2m_min[i] ?? 0),
        lluvia: d.precipitation_probability_max[i] ?? 0,
      });
    });
  }
  cache.set(k, { cuando: Date.now(), datos });
  return datos;
}

/** Previsión ya descargada (sin esperar); null si no la hay. */
export function previsionGuardada(lat: number, lon: number, fecha: Fecha): Prevision | null {
  return cache.get(clave(lat, lon))?.datos.get(fecha) ?? null;
}

export interface LugarEncontrado {
  nombre: string;
  detalle: string;
  lat: number;
  lon: number;
}

/** Buscar un sitio por nombre (para el tiempo del plan). */
export async function buscarLugar(nombre: string): Promise<LugarEncontrado[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre.trim())}&count=6&language=es&format=json`;
  const res = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error("No se pudo buscar el sitio.");
  const j = (await res.json()) as { results?: { name: string; admin1?: string; admin2?: string; country?: string; latitude: number; longitude: number }[] };
  return (j.results ?? []).map((r) => ({
    nombre: r.name,
    detalle: [r.admin2, r.admin1, r.country].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "),
    lat: r.latitude, lon: r.longitude,
  }));
}
