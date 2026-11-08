import type { Evento } from "./calendario";
import { esFecha, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";

/**
 * Festivos de Valladolid: los de la Comunidad (incluidos los nacionales, con
 * los traslados a lunes que decide la Junta) y los dos locales de la ciudad.
 *  - Comunidad: del decreto anual del BOCyL (se publica en primavera para el
 *    año siguiente). Hay que añadir cada año nuevo aquí.
 *     · 2026: Decreto 9/2025, de 29 de mayo (BOCyL 2/6/2025).
 *     · 2027: Decreto 7/2026, de 26 de marzo (BOCyL nº 61, 30/3/2026).
 *  - Locales: datos abiertos de la Junta, conjunto «Fiestas locales:
 *    calendario de fiestas de carácter local» (Valladolid, INE 47186). Se
 *    descargan solos; aquí quedan los ya conocidos por si no hay conexión.
 * No se guardan como eventos: se calculan y se pintan como «virtuales».
 */
export const RUTA_FESTIVOS = "datos/festivos.json";
export const ID_AJUSTES_FESTIVOS = "ajustes";

export const FESTIVOS_CYL: Record<number, [string, string][]> = {
  2026: [
    ["01-01", "Año Nuevo"], ["01-06", "Epifanía del Señor"], ["04-02", "Jueves Santo"], ["04-03", "Viernes Santo"],
    ["04-23", "Fiesta de Castilla y León"], ["05-01", "Fiesta del Trabajo"], ["08-15", "Asunción de la Virgen"],
    ["10-12", "Fiesta Nacional de España"], ["11-02", "Todos los Santos (trasladado al lunes)"],
    ["12-07", "Día de la Constitución (trasladado al lunes)"], ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"],
  ],
  2027: [
    ["01-01", "Año Nuevo"], ["01-06", "Epifanía del Señor"], ["03-25", "Jueves Santo"], ["03-26", "Viernes Santo"],
    ["04-23", "Fiesta de Castilla y León"], ["05-01", "Fiesta del Trabajo"], ["08-16", "Asunción de la Virgen (trasladada al lunes)"],
    ["10-12", "Fiesta Nacional de España"], ["11-01", "Todos los Santos"], ["12-06", "Día de la Constitución"],
    ["12-08", "Inmaculada Concepción"], ["12-25", "Navidad"],
  ],
};

export interface FestivoLocal {
  fecha: Fecha;
  nombre: string;
}

/** Locales de Valladolid ya publicados (reserva si no se pueden descargar). */
export const LOCALES_VALLADOLID: FestivoLocal[] = [
  { fecha: "2026-05-13", nombre: "San Pedro Regalado" },
  { fecha: "2026-09-08", nombre: "Virgen de San Lorenzo" },
];

export interface AjustesFestivos {
  id: typeof ID_AJUSTES_FESTIVOS;
  /** Pintarlos en el calendario. */
  mostrar: boolean;
  /** Quién libra los festivos (para el horario habitual y «¿Qué hacemos?»). */
  libran: Record<IdPersona, boolean>;
}

export const AJUSTES_FESTIVOS: AjustesFestivos = { id: ID_AJUSTES_FESTIVOS, mostrar: true, libran: { p1: true, p2: true } };

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en"]);
/** «NUESTRA SEÑORA DE SAN LORENZO» → «Nuestra Señora de San Lorenzo». */
export function nombreBonito(t: string): string {
  return t.trim().toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

/** Todos los festivos conocidos (Comunidad + locales), sin repetir días. */
export function listaFestivos(locales: FestivoLocal[]): FestivoLocal[] {
  const m = new Map<Fecha, string[]>();
  const poner = (fecha: Fecha, nombre: string) => {
    if (!esFecha(fecha) || !nombre.trim()) return;
    const ns = m.get(fecha) ?? [];
    if (!ns.some((n) => n.toLowerCase() === nombre.toLowerCase())) ns.push(nombre);
    m.set(fecha, ns);
  };
  for (const [anio, lista] of Object.entries(FESTIVOS_CYL)) for (const [md, n] of lista) poner(`${anio}-${md}`, n);
  // Los descargados mandan; la lista de reserva solo cubre los años que no han llegado.
  const aniosDescargados = new Set(locales.map((l) => l.fecha.slice(0, 4)));
  for (const l of [...locales, ...LOCALES_VALLADOLID.filter((l) => !aniosDescargados.has(l.fecha.slice(0, 4)))]) poner(l.fecha, nombreBonito(l.nombre));
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, ns]) => ({ fecha, nombre: ns.join(" · ") }));
}

/** Los festivos como eventos de todo el día (no se guardan; los pinta el calendario). */
export function eventosFestivos(aj: AjustesFestivos, locales: FestivoLocal[]): Evento[] {
  if (!aj.mostrar) return [];
  const libran = (["p1", "p2"] as const).filter((p) => aj.libran[p]);
  return listaFestivos(locales).map((f) => ({
    id: `festivo-${f.fecha}`, titulo: f.nombre, quien: "ambas", categoria: "festivo", inicio: f.fecha, fin: f.fecha,
    todoElDia: true, horaInicio: null, horaFin: null, lugar: "Valladolid", notas: null, repeticion: null, hasta: null,
    excepciones: [], privado: false, aviso: "ninguno", libran,
  }));
}

/** Último año con los festivos de la Comunidad ya metidos (para avisar de que toca actualizar). */
export const ULTIMO_ANIO_FESTIVOS = Math.max(...Object.keys(FESTIVOS_CYL).map(Number));
