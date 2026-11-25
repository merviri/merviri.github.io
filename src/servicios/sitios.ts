import type { TipoSitio, Zona } from "../dominio/zona";

/**
 * Sitios bonitos cerca de casa. La lista está en `zona.json` (repositorio
 * privado), no en el código. Las coordenadas son aproximadas: sirven para el
 * tiempo y la distancia; el mapa se abre buscando por el nombre.
 */
export type { TipoSitio };

export const TIPOS_SITIO: { id: TipoSitio; emoji: string; nombre: string }[] = [
  { id: "castillo", emoji: "🏰", nombre: "Castillos" },
  { id: "mirador", emoji: "🌄", nombre: "Miradores y paseos" },
  { id: "naturaleza", emoji: "🌳", nombre: "Naturaleza" },
  { id: "museo", emoji: "🏛️", nombre: "Museos y monumentos" },
  { id: "pueblo", emoji: "🏘️", nombre: "Pueblos con encanto" },
];

export interface SitioCercano {
  id: string;
  nombre: string;
  tipo: TipoSitio;
  lat: number;
  lon: number;
  km: number;
}

export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Los sitios de la zona, del más cercano al más lejano. */
export function sitiosCerca(zona: Zona | null): SitioCercano[] {
  if (!zona) return [];
  return zona.sitios
    .map((s) => ({ ...s, km: Math.round(distanciaKm(zona.ciudad, s)) }))
    .sort((a, b) => a.km - b.km || a.nombre.localeCompare(b.nombre, "es"));
}

export const enlaceMapa = (nombre: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nombre)}`;
