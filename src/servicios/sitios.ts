import { VALLADOLID } from "./tiempo";

/**
 * Sitios bonitos cerca de Valladolid: una lista hecha a mano (va con la app,
 * no depende de ningún servidor). Las coordenadas son aproximadas: sirven
 * para el tiempo y la distancia; el mapa se abre buscando por el nombre.
 */
export type TipoSitio = "castillo" | "mirador" | "naturaleza" | "museo" | "pueblo";

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

const s = (id: string, nombre: string, tipo: TipoSitio, lat: number, lon: number): SitioCercano =>
  ({ id, nombre, tipo, lat, lon, km: Math.round(distanciaKm(VALLADOLID, { lat, lon })) });

export const SITIOS_CERCA: SitioCercano[] = [
  s("fuensaldana", "Castillo de Fuensaldaña", "castillo", 41.700, -4.764),
  s("simancas", "Castillo de Simancas", "castillo", 41.592, -4.828),
  s("portillo", "Castillo de Portillo", "castillo", 41.480, -4.588),
  s("torrelobaton", "Castillo de Torrelobatón", "castillo", 41.649, -5.024),
  s("penafiel", "Castillo de Peñafiel", "castillo", 41.597, -4.117),
  s("mota", "Castillo de la Mota (Medina del Campo)", "castillo", 41.309, -4.906),
  s("cuellar", "Castillo de Cuéllar", "castillo", 41.401, -4.315),
  s("coca", "Castillo de Coca", "castillo", 41.218, -4.526),
  s("moreras", "Las Moreras y la ribera del Pisuerga", "mirador", 41.647, -4.735),
  s("campo-grande", "Campo Grande", "mirador", 41.648, -4.730),
  s("otero", "Cristo del Otero (Palencia)", "mirador", 42.018, -4.538),
  s("canal", "Canal de Castilla en Medina de Rioseco", "naturaleza", 41.883, -5.044),
  s("antequera", "Pinar de Antequera", "naturaleza", 41.605, -4.700),
  s("nava", "Laguna de La Nava (aves)", "naturaleza", 42.077, -4.737),
  s("duraton", "Hoces del Duratón", "naturaleza", 41.322, -3.855),
  s("riaza", "Hoces del río Riaza", "naturaleza", 41.560, -3.660),
  s("escultura", "Museo Nacional de Escultura", "museo", 41.656, -4.722),
  s("ciencia", "Museo de la Ciencia de Valladolid", "museo", 41.639, -4.735),
  s("valbuena", "Monasterio de Santa María de Valbuena", "museo", 41.634, -4.289),
  s("olmeda", "Villa romana La Olmeda", "museo", 42.476, -4.733),
  s("uruena", "Urueña, villa del libro", "pueblo", 41.727, -5.203),
  s("tordesillas", "Tordesillas", "pueblo", 41.502, -5.000),
  s("rioseco", "Medina de Rioseco", "pueblo", 41.883, -5.044),
  s("lerma", "Lerma", "pueblo", 42.026, -3.757),
  s("sepulveda", "Sepúlveda", "pueblo", 41.297, -3.744),
  s("covarrubias", "Covarrubias", "pueblo", 42.059, -3.518),
].sort((a, b) => a.km - b.km);

export const enlaceMapa = (nombre: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nombre)}`;
