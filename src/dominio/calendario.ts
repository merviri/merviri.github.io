import { diasEntre, esFecha, sumarDias, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";

/**
 * Calendario común: cosas de Elvira, de María o de las dos.
 *  - Eventos sueltos en `datos/calendario/<año>.json` (por año de inicio, para
 *    que ningún fichero crezca sin fin).
 *  - Eventos que se repiten en `datos/calendario/repetidos.json`.
 *  - Horario habitual de cada una en `datos/horarios.json`.
 * Las horas son siempre hora de Madrid («HH:MM»).
 */
export const PREFIJO_CALENDARIO = "datos/calendario/";
export const RUTA_REPETIDOS = `${PREFIJO_CALENDARIO}repetidos.json`;
export const rutaAnio = (anio: string) => `${PREFIJO_CALENDARIO}${anio}.json`;
export const RUTA_HORARIOS = "datos/horarios.json";

export type Quien = IdPersona | "ambas";

export type Categoria = "plan" | "trabajo" | "vacaciones" | "festivo" | "medico" | "familia" | "amigos" | "viaje" | "cumple" | "otro";
export const CATEGORIAS: { id: Categoria; emoji: string; nombre: string }[] = [
  { id: "plan", emoji: "✨", nombre: "Plan" },
  { id: "trabajo", emoji: "💼", nombre: "Trabajo" },
  { id: "vacaciones", emoji: "🌴", nombre: "Vacaciones / libre" },
  { id: "medico", emoji: "🩺", nombre: "Médico" },
  { id: "familia", emoji: "👪", nombre: "Familia" },
  { id: "amigos", emoji: "🥂", nombre: "Amigos" },
  { id: "viaje", emoji: "🧳", nombre: "Viaje" },
  { id: "cumple", emoji: "🎂", nombre: "Cumpleaños" },
  { id: "otro", emoji: "📌", nombre: "Otro" },
  // Solo los festivos que pone la app (no se elige al apuntar).
  { id: "festivo", emoji: "🎉", nombre: "Festivo" },
];
export const emojiCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.id === c)?.emoji ?? "📌";
/**
 * «Vacaciones / libre»: esos días (o esas horas) no cuenta el horario habitual
 * de esa persona, y no la ocupan. Sirve para vacaciones, festivos y tardes libres.
 */
export const esLibre = (e: Pick<Evento, "categoria">) => e.categoria === "vacaciones" || e.categoria === "festivo";
/** Si ese día (o rato) libre es de esta persona. Los festivos, según quién los libra. */
export const libraEse = (e: Pick<Evento, "categoria" | "quien" | "libran">, persona: IdPersona) =>
  e.categoria === "festivo" ? (e.libran ?? []).includes(persona) : e.quien === persona || e.quien === "ambas";

export type UnidadRep = "dia" | "semana" | "mes" | "anio";
export interface RepeticionEvento {
  cada: number;
  unidad: UnidadRep;
}

export type AvisoEvento = "ninguno" | "vispera" | "manana" | "antes";
export const AVISOS_EVENTO: { id: AvisoEvento; texto: string }[] = [
  { id: "ninguno", texto: "Sin aviso" },
  { id: "vispera", texto: "La víspera a las 20:00" },
  { id: "manana", texto: "Ese día a las 9:00" },
  { id: "antes", texto: "Un par de horas antes" },
];

export interface Evento {
  id: string;
  titulo: string;
  quien: Quien;
  categoria: Categoria;
  inicio: Fecha;
  /** Último día (igual a inicio si es de un solo día). */
  fin: Fecha;
  todoElDia: boolean;
  horaInicio: string | null;
  horaFin: string | null;
  lugar: string | null;
  notas: string | null;
  repeticion: RepeticionEvento | null;
  /** Último día en que se repite (null = siempre). */
  hasta: Fecha | null;
  /** Días (de inicio de una repetición) que se han quitado. */
  excepciones: Fecha[];
  /** «Ocupada» sin detalles: la otra solo ve que está ocupada. */
  privado: boolean;
  aviso: AvisoEvento;
  /** Solo en los festivos (que no se guardan): quién libra ese día. */
  libran?: IdPersona[];
}

export const rutaDeEvento = (e: Pick<Evento, "repeticion" | "inicio">) => (e.repeticion ? RUTA_REPETIDOS : rutaAnio(e.inicio.slice(0, 4)));

export const esHora = (x: unknown): x is string => typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);

/** Sumar n periodos desde el inicio (sin arrastrar el ajuste de fin de mes). */
export function sumarRepeticion(f: Fecha, r: RepeticionEvento, n: number): Fecha {
  if (r.unidad === "dia") return sumarDias(f, r.cada * n);
  if (r.unidad === "semana") return sumarDias(f, 7 * r.cada * n);
  const meses = r.unidad === "mes" ? r.cada * n : 12 * r.cada * n;
  const total = +f.slice(5, 7) - 1 + meses;
  const a = +f.slice(0, 4) + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const d = Math.min(+f.slice(8, 10), ultimo);
  return `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface Ocurrencia<E extends Evento = Evento> {
  evento: E;
  /** Día en que empieza esta vez. */
  dia: Fecha;
  /** Día en que acaba esta vez. */
  hastaDia: Fecha;
}

/** Veces que el evento ocurre y tocan el intervalo [desde, hasta] (ambos incluidos). */
export function ocurrencias<E extends Evento>(e: E, desde: Fecha, hasta: Fecha): Ocurrencia<E>[] {
  const dur = Math.max(0, diasEntre(e.inicio, e.fin));
  const out: Ocurrencia<E>[] = [];
  if (!e.repeticion) {
    if (e.fin >= desde && e.inicio <= hasta) out.push({ evento: e, dia: e.inicio, hastaDia: e.fin });
    return out;
  }
  const excep = new Set(e.excepciones ?? []);
  // Saltar de golpe hasta cerca de «desde» en repeticiones diarias o semanales.
  let n = 0;
  if (e.repeticion.unidad === "dia" || e.repeticion.unidad === "semana") {
    const paso = e.repeticion.cada * (e.repeticion.unidad === "dia" ? 1 : 7);
    n = Math.max(0, Math.floor((diasEntre(e.inicio, desde) - dur) / paso) - 1);
  } else {
    const pasoMeses = e.repeticion.cada * (e.repeticion.unidad === "mes" ? 1 : 12);
    const meses = (+desde.slice(0, 4) - +e.inicio.slice(0, 4)) * 12 + (+desde.slice(5, 7) - +e.inicio.slice(5, 7));
    n = Math.max(0, Math.floor(meses / pasoMeses) - 1);
  }
  for (let i = 0; i < 5000; i++, n++) {
    const dia = sumarRepeticion(e.inicio, e.repeticion, n);
    if (dia > hasta || (e.hasta && dia > e.hasta)) break;
    const fin = sumarDias(dia, dur);
    if (fin >= desde && !excep.has(dia)) out.push({ evento: e, dia, hastaDia: fin });
  }
  return out;
}

const minutos = (h: string | null) => (h ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : -1);

/** Lo que pasa un día: primero lo de todo el día, luego por hora. */
export function delDia<E extends Evento>(eventos: E[], dia: Fecha): Ocurrencia<E>[] {
  return eventos
    .flatMap((e) => ocurrencias(e, dia, dia))
    .sort((a, b) => {
      const ta = a.evento.todoElDia || a.dia < dia ? -1 : minutos(a.evento.horaInicio);
      const tb = b.evento.todoElDia || b.dia < dia ? -1 : minutos(b.evento.horaInicio);
      return ta - tb || a.evento.titulo.localeCompare(b.evento.titulo, "es");
    });
}

/** Texto de la hora de una ocurrencia vista un día concreto. */
export function textoHora(o: Ocurrencia, dia: Fecha): string {
  const e = o.evento;
  const variosDias = o.dia !== o.hastaDia;
  if (e.todoElDia) return variosDias ? (dia === o.hastaDia ? "Último día" : "Todo el día") : "Todo el día";
  if (variosDias) {
    if (dia === o.dia) return `Desde las ${e.horaInicio}`;
    if (dia === o.hastaDia) return e.horaFin ? `Hasta las ${e.horaFin}` : "Último día";
    return "Todo el día";
  }
  return e.horaFin ? `${e.horaInicio}–${e.horaFin}` : `${e.horaInicio}`;
}

/** Cómo ve una persona un evento: los «ocupada» de la otra, sin detalles. */
export function visibleComo<E extends Evento>(e: E, yo: IdPersona): E {
  if (!e.privado || e.quien === yo || e.quien === "ambas") return e;
  return { ...e, titulo: "Ocupada", lugar: null, notas: null, categoria: "otro" };
}

export const esDe = (e: Evento, p: IdPersona) => e.quien === p || e.quien === "ambas";

export function problemaEvento(e: Evento): string | null {
  const t = e.titulo.trim();
  if (!t) return "Ponle un nombre.";
  if (t.length > 120) return "El nombre puede tener como mucho 120 caracteres.";
  if (!esFecha(e.inicio) || !esFecha(e.fin)) return "Las fechas no son válidas.";
  if (e.fin < e.inicio) return "El final no puede ser antes del principio.";
  if (!e.todoElDia) {
    if (!esHora(e.horaInicio)) return "Falta la hora de inicio.";
    if (e.horaFin !== null && !esHora(e.horaFin)) return "La hora de fin no es válida.";
    if (e.inicio === e.fin && e.horaFin && e.horaFin < e.horaInicio) return "La hora de fin es antes que la de inicio.";
  }
  if (e.repeticion) {
    if (!Number.isInteger(e.repeticion.cada) || e.repeticion.cada < 1 || e.repeticion.cada > 99) return "La repetición no es válida.";
    if (e.hasta && (!esFecha(e.hasta) || e.hasta < e.inicio)) return "El fin de la repetición no es válido.";
  }
  if (e.privado && e.quien === "ambas") return "Un evento de las dos no puede ser privado.";
  return null;
}

export function textoRepeticionEvento(r: RepeticionEvento | null): string {
  if (!r) return "No se repite";
  const n: Record<UnidadRep, [string, string]> = { dia: ["día", "días"], semana: ["semana", "semanas"], mes: ["mes", "meses"], anio: ["año", "años"] };
  const [uno, varios] = n[r.unidad];
  return r.cada === 1 ? `Cada ${uno}` : `Cada ${r.cada} ${varios}`;
}

// ---------------------------------------------------------------------------
// Semanas y meses
// ---------------------------------------------------------------------------

/** 1 = lunes … 7 = domingo. */
export function diaSemana(f: Fecha): number {
  const d = new Date(`${f}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export const inicioSemana = (f: Fecha) => sumarDias(f, 1 - diaSemana(f));

/** Las 42 casillas (6 semanas, de lunes a domingo) del mes de `f`. */
export function cuadriculaMes(f: Fecha): Fecha[] {
  const primero = `${f.slice(0, 7)}-01`;
  const inicio = inicioSemana(primero);
  return Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
}

export function sumarMeses(f: Fecha, n: number): Fecha {
  return sumarRepeticion(`${f.slice(0, 7)}-01`, { cada: 1, unidad: "mes" }, n);
}

// ---------------------------------------------------------------------------
// Horario habitual
// ---------------------------------------------------------------------------

export interface BloqueHorario {
  /** Días de la semana (1 = lunes … 7 = domingo). */
  dias: number[];
  desde: string;
  hasta: string;
  etiqueta: string;
}

export interface Horario {
  id: IdPersona;
  bloques: BloqueHorario[];
}

export function problemaBloque(b: BloqueHorario): string | null {
  if (!b.dias.length) return "Elige al menos un día.";
  if (!esHora(b.desde) || !esHora(b.hasta)) return "Las horas no son válidas.";
  if (b.hasta <= b.desde) return "La hora de fin tiene que ser después de la de inicio.";
  if (b.etiqueta.length > 40) return "El nombre puede tener como mucho 40 caracteres.";
  return null;
}

export const bloquesDelDia = (h: Horario | undefined, f: Fecha) => (h?.bloques ?? []).filter((b) => b.dias.includes(diaSemana(f)));

/** Rato (en minutos) que ocupa una ocurrencia de un evento en un día concreto. */
export function intervaloEnDia(e: Evento, o: { dia: Fecha; hastaDia: Fecha }, dia: Fecha): [number, number] {
  if (e.todoElDia || !e.horaInicio) return [0, 1440];
  const ini = o.dia === dia ? minutos(e.horaInicio) : 0;
  const fin = o.hastaDia === dia ? (e.horaFin ? minutos(e.horaFin) : Math.min(1440, minutos(e.horaInicio) + 60)) : 1440;
  return [ini, Math.max(ini + 30, fin)];
}

export interface TramoHorario {
  desde: number;
  hasta: number;
  etiqueta: string;
}

/** Horario habitual de una persona un día, quitando sus vacaciones y ratos libres. */
export function horarioDelDia(h: Horario | undefined, dia: Fecha, persona: IdPersona, eventos: Evento[]): TramoHorario[] {
  let tramos: TramoHorario[] = bloquesDelDia(h, dia).map((b) => ({ desde: minutos(b.desde), hasta: minutos(b.hasta), etiqueta: b.etiqueta }));
  if (!tramos.length) return tramos;
  for (const e of eventos) {
    if (!esLibre(e) || !libraEse(e, persona)) continue;
    for (const o of ocurrencias(e, dia, dia)) {
      const [a, b] = intervaloEnDia(e, o, dia);
      tramos = tramos.flatMap((t) => [
        ...(t.desde < a ? [{ ...t, hasta: Math.min(t.hasta, a) }] : []),
        ...(t.hasta > b ? [{ ...t, desde: Math.max(t.desde, b) }] : []),
      ]).filter((t) => t.hasta > t.desde);
    }
  }
  return tramos;
}

export const LETRAS_DIA = ["L", "M", "X", "J", "V", "S", "D"];
