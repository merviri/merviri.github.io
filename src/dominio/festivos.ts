import type { Evento } from "./calendario";
import { esFecha, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";
import type { Zona } from "./zona";

/**
 * Festivos de vuestra ciudad: los de la comunidad (incluidos los nacionales,
 * con los traslados a lunes que decida cada año) y las dos fiestas locales.
 *  - Los de la comunidad vienen de `zona.json` (repositorio privado de
 *    datos); hay que añadir allí cada año nuevo cuando se publique.
 *  - Los locales se descargan solos de los datos abiertos (ver
 *    `servicios/festivos.ts`); los de `zona.json` son la reserva.
 * No se guardan como eventos: se calculan y se pintan como «virtuales».
 */
export const RUTA_FESTIVOS = "datos/festivos.json";
export const ID_AJUSTES_FESTIVOS = "ajustes";

export interface FestivoLocal {
  fecha: Fecha;
  nombre: string;
}

export interface AjustesFestivos {
  id: typeof ID_AJUSTES_FESTIVOS;
  /** Pintarlos en el calendario. */
  mostrar: boolean;
  /** Quién libra los festivos (para el horario habitual y «¿Qué hacemos?»). */
  libran: Record<IdPersona, boolean>;
}

export const AJUSTES_FESTIVOS: AjustesFestivos = { id: ID_AJUSTES_FESTIVOS, mostrar: true, libran: { p1: true, p2: true } };

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en"]);
/** «NUESTRA SEÑORA DE LA PAZ» → «Nuestra Señora de la Paz». */
export function nombreBonito(t: string): string {
  return t.trim().toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

/** Todos los festivos conocidos (comunidad + locales), sin repetir días. */
export function listaFestivos(zona: Zona | null, locales: FestivoLocal[]): FestivoLocal[] {
  if (!zona) return [];
  const m = new Map<Fecha, string[]>();
  const poner = (fecha: Fecha, nombre: string) => {
    if (!esFecha(fecha) || !nombre.trim()) return;
    const ns = m.get(fecha) ?? [];
    if (!ns.some((n) => n.toLowerCase() === nombre.toLowerCase())) ns.push(nombre);
    m.set(fecha, ns);
  };
  for (const [anio, lista] of Object.entries(zona.festivos)) for (const [md, n] of lista) poner(`${anio}-${md}`, n);
  // Los descargados mandan; la lista de reserva solo cubre los años que no han llegado.
  const aniosDescargados = new Set(locales.map((l) => l.fecha.slice(0, 4)));
  for (const l of [...locales, ...zona.localesReserva.filter((l) => !aniosDescargados.has(l.fecha.slice(0, 4)))]) poner(l.fecha, nombreBonito(l.nombre));
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, ns]) => ({ fecha, nombre: ns.join(" · ") }));
}

/** Los festivos como eventos de todo el día (no se guardan; los pinta el calendario). */
export function eventosFestivos(aj: AjustesFestivos, zona: Zona | null, locales: FestivoLocal[]): Evento[] {
  if (!aj.mostrar || !zona) return [];
  const libran = (["p1", "p2"] as const).filter((p) => aj.libran[p]);
  return listaFestivos(zona, locales).map((f) => ({
    id: `festivo-${f.fecha}`, titulo: f.nombre, quien: "ambas", categoria: "festivo", inicio: f.fecha, fin: f.fecha,
    todoElDia: true, horaInicio: null, horaFin: null, lugar: zona.ciudad.nombre, notas: null, repeticion: null, hasta: null,
    excepciones: [], privado: false, aviso: "ninguno", libran,
  }));
}

/** Último año con los festivos de la comunidad ya puestos (null si no hay ninguno). */
export function ultimoAnioFestivos(zona: Zona | null): number | null {
  const anios = Object.keys(zona?.festivos ?? {}).map(Number).filter((a) => zona!.festivos[String(a)]!.length);
  return anios.length ? Math.max(...anios) : null;
}
