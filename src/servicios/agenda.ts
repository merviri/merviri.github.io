import { esFecha, sumarDias, type Fecha } from "../dominio/fechas";

/**
 * Agenda cultural de la Junta de Castilla y León (datos abiertos, sin
 * clave): conciertos, teatro, exposiciones… de la provincia de Valladolid.
 * https://analisis.datosabiertos.jcyl.es (conjunto «Eventos de la agenda
 * cultural categorizados y geolocalizados»).
 */
const BASE = "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records";

export interface EventoAgenda {
  id: string;
  titulo: string;
  categoria: string;
  tematica: string | null;
  inicio: Fecha;
  fin: Fecha | null;
  hora: string | null;
  precio: string | null;
  lugar: string | null;
  localidad: string | null;
  enlace: string | null;
  infantil: boolean;
  lat: number | null;
  lon: number | null;
}

interface Crudo {
  id_evento?: number | string;
  titulo?: string;
  categoria?: string | null;
  tematica?: string | null;
  fecha_inicio?: string;
  fecha_fin?: string | null;
  hora_inicio?: string | null;
  precio?: string | null;
  lugar_celebracion?: string | null;
  nombre_localidad?: string | null;
  enlace_contenido?: string | null;
  destinatarios?: string | null;
  latitud?: number | null;
  longitud?: number | null;
}

/** «18:30 h» → «18:30». */
export function normalizarHora(h: string | null | undefined): string | null {
  const m = /(\d{1,2})[:.](\d{2})/.exec(h ?? "");
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}` : null;
}

export function convertir(r: Crudo): EventoAgenda | null {
  const inicio = (r.fecha_inicio ?? "").slice(0, 10);
  if (!r.titulo || !esFecha(inicio)) return null;
  const fin = (r.fecha_fin ?? "").slice(0, 10);
  const enlace = r.enlace_contenido && /^https?:\/\//.test(r.enlace_contenido) ? r.enlace_contenido : null;
  return {
    id: String(r.id_evento ?? `${inicio}-${r.titulo}`),
    titulo: r.titulo.trim(),
    categoria: r.categoria?.trim() || "Otros",
    tematica: r.tematica?.trim() || null,
    inicio,
    fin: esFecha(fin) ? fin : null,
    hora: normalizarHora(r.hora_inicio),
    precio: r.precio?.trim() || null,
    lugar: r.lugar_celebracion?.trim() || null,
    localidad: r.nombre_localidad?.trim() || null,
    enlace,
    infantil: /infantil|niñ|familiar/i.test(r.destinatarios ?? ""),
    lat: typeof r.latitud === "number" ? r.latitud : null,
    lon: typeof r.longitud === "number" ? r.longitud : null,
  };
}

let cache: { cuando: number; datos: EventoAgenda[] } | null = null;

export async function agendaValladolid(hoyF: Fecha, dias = 45): Promise<EventoAgenda[]> {
  if (cache && Date.now() - cache.cuando < 30 * 60 * 1000) return cache.datos;
  const hasta = sumarDias(hoyF, dias);
  const where = `nombre_provincia="Valladolid" and fecha_inicio<="${hasta}" and (fecha_inicio>="${hoyF}" or fecha_fin>="${hoyF}")`;
  const select = "id_evento,titulo,categoria,tematica,fecha_inicio,fecha_fin,hora_inicio,precio,lugar_celebracion,nombre_localidad,enlace_contenido,destinatarios,latitud,longitud";
  const url = `${BASE}?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&order_by=fecha_inicio&limit=100`;
  const res = await fetch(url, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`No se pudo leer la agenda (${res.status}).`);
  const j = (await res.json()) as { results?: Crudo[] };
  const datos = (j.results ?? []).map(convertir).filter((x): x is EventoAgenda => x !== null);
  cache = { cuando: Date.now(), datos };
  return datos;
}
