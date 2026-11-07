import { diasEntre, esFecha, sumarDias, type Fecha } from "./fechas";
import { otraPersona, type IdPersona } from "./pareja";

/**
 * Tareas: con responsable (una, la otra, las dos o por turnos), fecha
 * opcional y repetición opcional. Al completar una tarea que se repite, su
 * fecha pasa a la siguiente vez y, si va por turnos, le toca a la otra.
 */
export const RUTA_TAREAS = "datos/tareas.json";

export type Responsable = IdPersona | "ambas" | "turnos";
export type Unidad = "dia" | "semana" | "mes";

export interface Repeticion {
  cada: number;
  unidad: Unidad;
}

export interface Recordatorio {
  por: IdPersona;
  para: IdPersona;
  en: string;
  visto: string | null;
}

export interface Tarea {
  id: string;
  titulo: string;
  notas: string | null;
  responsable: Responsable;
  /** A quién le toca (solo si va por turnos). */
  turno: IdPersona | null;
  fecha: Fecha | null;
  repeticion: Repeticion | null;
  /** Para las que no se repiten: si está hecha. */
  hecha: boolean;
  /** Última vez que se hizo (y quién). */
  hechaPor: IdPersona | null;
  hechaEn: string | null;
  recordatorio: Recordatorio | null;
}

export function sumarPeriodo(f: Fecha, r: Repeticion): Fecha {
  if (r.unidad === "dia") return sumarDias(f, r.cada);
  if (r.unidad === "semana") return sumarDias(f, 7 * r.cada);
  const anio = +f.slice(0, 4);
  const mes = +f.slice(5, 7) - 1 + r.cada;
  const a = anio + Math.floor(mes / 12);
  const m = ((mes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const d = Math.min(+f.slice(8, 10), ultimo);
  return `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Siguiente vez a partir de la fecha prevista; si ya pasó, la primera después de hoy. */
export function siguienteFecha(fecha: Fecha | null, r: Repeticion, hoyF: Fecha): Fecha {
  let s = sumarPeriodo(fecha ?? hoyF, r);
  for (let i = 0; s <= hoyF && i < 1000; i++) s = sumarPeriodo(s, r);
  return s;
}

export function completar(t: Tarea, por: IdPersona, hoyF: Fecha, ahora: string): Tarea {
  const comun = { hechaPor: por, hechaEn: ahora, recordatorio: null };
  if (t.repeticion) {
    return {
      ...t, ...comun,
      hecha: false,
      fecha: siguienteFecha(t.fecha, t.repeticion, hoyF),
      // Si va por turnos, la próxima le toca a quien no la acaba de hacer.
      turno: t.responsable === "turnos" ? otraPersona(por) : t.turno,
    };
  }
  return { ...t, ...comun, hecha: true };
}

export function reabrir(t: Tarea): Tarea {
  return { ...t, hecha: false };
}

/** A quién le toca ahora. */
export function aQuien(t: Tarea): IdPersona | "ambas" {
  if (t.responsable === "turnos") return t.turno ?? "p1";
  return t.responsable;
}

export const esMia = (t: Tarea, yo: IdPersona) => {
  const q = aQuien(t);
  return q === yo || q === "ambas";
};

export type Seccion = "atrasadas" | "hoy" | "semana" | "despues" | "sinFecha";
export const SECCIONES: { id: Seccion; titulo: string }[] = [
  { id: "atrasadas", titulo: "Atrasadas" },
  { id: "hoy", titulo: "Hoy" },
  { id: "semana", titulo: "Próximos 7 días" },
  { id: "despues", titulo: "Más adelante" },
  { id: "sinFecha", titulo: "Sin fecha" },
];

export function seccion(t: Tarea, hoyF: Fecha): Seccion {
  if (!t.fecha) return "sinFecha";
  const d = diasEntre(hoyF, t.fecha);
  if (d < 0) return "atrasadas";
  if (d === 0) return "hoy";
  if (d <= 7) return "semana";
  return "despues";
}

export function agrupar<T extends Tarea>(tareas: T[], hoyF: Fecha): Record<Seccion, T[]> {
  const g: Record<Seccion, T[]> = { atrasadas: [], hoy: [], semana: [], despues: [], sinFecha: [] };
  for (const t of tareas) if (!t.hecha) g[seccion(t, hoyF)].push(t);
  for (const k of Object.keys(g) as Seccion[]) {
    g[k].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.titulo.localeCompare(b.titulo, "es"));
  }
  return g;
}

/** Hechas (las que no se repiten) en los últimos días, la más reciente primero. */
export function hechasRecientes<T extends Tarea>(tareas: T[], ahora: Date, dias = 14): T[] {
  const limite = ahora.getTime() - dias * 86_400_000;
  return tareas
    .filter((t) => t.hecha && t.hechaEn && new Date(t.hechaEn).getTime() >= limite)
    .sort((a, b) => (b.hechaEn ?? "").localeCompare(a.hechaEn ?? ""));
}

export function textoRepeticion(r: Repeticion | null): string {
  if (!r) return "No se repite";
  const nombres: Record<Unidad, [string, string]> = { dia: ["día", "días"], semana: ["semana", "semanas"], mes: ["mes", "meses"] };
  const [uno, varios] = nombres[r.unidad];
  return r.cada === 1 ? `Cada ${uno}` : `Cada ${r.cada} ${varios}`;
}

/** Recordatorios que la otra me ha mandado y aún no he visto. */
export function recordatoriosPara<T extends Tarea>(tareas: T[], yo: IdPersona): T[] {
  return tareas.filter((t) => t.recordatorio && t.recordatorio.para === yo && !t.recordatorio.visto && !t.hecha);
}

export function problemaTarea(t: Pick<Tarea, "titulo" | "fecha" | "repeticion" | "responsable" | "turno">): string | null {
  const titulo = t.titulo.trim();
  if (!titulo) return "Ponle un nombre a la tarea.";
  if (titulo.length > 120) return "Como mucho 120 caracteres.";
  if (t.fecha !== null && !esFecha(t.fecha)) return "La fecha no es válida.";
  if (t.repeticion && (!Number.isInteger(t.repeticion.cada) || t.repeticion.cada < 1 || t.repeticion.cada > 365)) {
    return "La repetición no es válida.";
  }
  if (t.responsable === "turnos" && !t.turno) return "Elige a quién le toca la primera vez.";
  return null;
}
