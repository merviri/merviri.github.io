import type { Aviso } from "../avisos/push";
import { delDia, esDe, ocurrencias, type Evento } from "./calendario";
import { esFecha, sumarDias, ZONA, type Fecha } from "./fechas";
import { contador, type IdPersona, type Pareja } from "./pareja";
import { esMia, type Tarea } from "./tareas";

/**
 * Avisos (notificaciones):
 *  - `datos/suscripciones.json` (cifrado): un registro por dispositivo con su
 *    dirección de avisos, sus claves y qué avisos quiere recibir;
 *  - `avisos/programados.json` (en claro, pero cada aviso va cifrado para su
 *    dispositivo): los avisos con hora (resumen de la mañana, aniversarios),
 *    que GitHub Actions manda cada hora;
 *  - `datos/plan-avisos.json` (cifrado): huella del último plan, para no
 *    reescribir lo programado si no ha cambiado nada.
 */
export const RUTA_SUSCRIPCIONES = "datos/suscripciones.json";
export const RUTA_PLAN = "datos/plan-avisos.json";
export const RUTA_PROGRAMADOS = "avisos/programados.json";
export const ID_PLAN = "plan";
export const WORKFLOW_AVISOS = "avisos.yml";

export type TipoAviso = "dibujo" | "megusta" | "recordatorio" | "tarea" | "lista" | "nota" | "evento" | "plan" | "gasto" | "manana" | "aniversario";

export const TIPOS_AVISO: { tipo: TipoAviso; texto: string; porDefecto: boolean }[] = [
  { tipo: "dibujo", texto: "🎨 Dibujos para mí", porDefecto: true },
  { tipo: "megusta", texto: "❤️ Cuando le gusta un dibujo mío", porDefecto: true },
  { tipo: "recordatorio", texto: "🔔 «Recuérdaselo» de una tarea", porDefecto: true },
  { tipo: "tarea", texto: "✅ Tareas nuevas para mí", porDefecto: true },
  { tipo: "lista", texto: "📝 Cosas nuevas en las listas", porDefecto: true },
  { tipo: "nota", texto: "🗒️ Notas nuevas", porDefecto: false },
  { tipo: "evento", texto: "📅 Calendario: eventos nuevos y recordatorios", porDefecto: true },
  { tipo: "plan", texto: "✨ Ideas nuevas en Planes", porDefecto: true },
  { tipo: "gasto", texto: "💶 Gastos nuevos", porDefecto: true },
  { tipo: "manana", texto: "☀️ Resumen de la mañana (9:00): mis planes y tareas del día", porDefecto: true },
  { tipo: "aniversario", texto: "💜 Aniversarios y días redondos", porDefecto: true },
];

export interface Preferencias {
  tipos: Partial<Record<TipoAviso, boolean>>;
  /** Horas de silencio («23:00» a «08:00»): los avisos llegan sin sonido. null = sin silencio. */
  silencioDesde: string | null;
  silencioHasta: string | null;
}

export const PREFERENCIAS_INICIALES: Preferencias = { tipos: {}, silencioDesde: "23:00", silencioHasta: "08:00" };

export interface Suscripcion {
  /** Id del dispositivo. */
  id: string;
  persona: IdPersona;
  nombre: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  prefs: Preferencias;
}

export function quiere(s: Pick<Suscripcion, "prefs">, tipo: TipoAviso): boolean {
  const v = s.prefs?.tipos?.[tipo];
  return v ?? TIPOS_AVISO.find((x) => x.tipo === tipo)?.porDefecto ?? true;
}

const esHora = (x: unknown): x is string => typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);

/** Hora en Madrid, «HH:MM». */
export function horaMadrid(ahora: Date): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora);
}

export function enSilencio(prefs: Preferencias, ahora: Date): boolean {
  const { silencioDesde: d, silencioHasta: h } = prefs;
  if (!esHora(d) || !esHora(h) || d === h) return false;
  const t = horaMadrid(ahora);
  return d < h ? t >= d && t < h : t >= d || t < h;
}

/** Instante (UTC) en que en Madrid es `fecha` a la hora `hhmm`. */
export function instanteMadrid(fecha: Fecha, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number) as [number, number];
  const objetivo = Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), hh, mm);
  let t = objetivo;
  // Dos pasadas bastan para ajustar el desfase (también en los cambios de hora).
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(t));
    const v = (k: string) => +p.find((x) => x.type === k)!.value;
    const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"));
    t += objetivo - local;
  }
  return new Date(t);
}

export function enumerar(cosas: string[], max = 3): string {
  const n = cosas.length;
  if (n === 0) return "";
  if (n === 1) return cosas[0]!;
  if (n <= max) return `${cosas.slice(0, -1).join(", ")} y ${cosas[n - 1]}`;
  return `${cosas.slice(0, max).join(", ")} y ${n - max} más`;
}

export interface EntradaPlan {
  cuando: string;
  dispositivo: string;
  aviso: Aviso;
}

/**
 * Avisos con hora de los próximos días, a partir de los datos actuales.
 * Es una función pura: los dos móviles calculan lo mismo con los mismos datos.
 */
export function planificar(d: {
  tareas: Tarea[];
  eventos?: Evento[];
  pareja: Pareja;
  suscripciones: Suscripcion[];
  ahora: Date;
  hoy: Fecha;
  horaManana?: string;
  dias?: number;
}): EntradaPlan[] {
  const hora = d.horaManana ?? "09:00";
  const salida: EntradaPlan[] = [];
  for (let i = 0; i < (d.dias ?? 7); i++) {
    const dia = sumarDias(d.hoy, i);
    const cuando = instanteMadrid(dia, hora);
    if (cuando.getTime() <= d.ahora.getTime()) continue;
    const iso = cuando.toISOString();

    // Resumen de la mañana, por persona: sus planes del día y sus tareas.
    for (const s of d.suscripciones) {
      if (!quiere(s, "manana")) continue;
      const pendientes = d.tareas
        .filter((t) => !t.hecha && t.fecha && esFecha(t.fecha) && t.fecha <= dia && esMia(t, s.persona))
        .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "") || a.titulo.localeCompare(b.titulo, "es"));
      const planes = delDia((d.eventos ?? []).filter((e) => esDe(e, s.persona)), dia)
        .map((o) => (o.evento.todoElDia || o.dia < dia ? o.evento.titulo : `${o.evento.titulo} (${o.evento.horaInicio})`));
      if (!pendientes.length && !planes.length) continue;
      const atrasadas = pendientes.filter((t) => t.fecha! < dia).length;
      const partes = [
        planes.length ? `📅 ${enumerar(planes)}` : "",
        pendientes.length ? `✅ ${enumerar(pendientes.map((t) => t.titulo))}${atrasadas ? ` (${atrasadas} atrasada${atrasadas === 1 ? "" : "s"})` : ""}` : "",
      ].filter(Boolean);
      salida.push({
        cuando: iso, dispositivo: s.id,
        aviso: {
          t: `☀️ Buenos días, ${d.pareja.personas[s.persona].nombre}`,
          b: `Hoy: ${partes.join(" · ")}`,
          r: planes.length ? "calendario" : "tareas", e: "manana",
        },
      });
    }

    // Aniversarios y días redondos, para las dos.
    if (d.pareja.juntasDesde) {
      const c = contador(d.pareja.juntasDesde, dia);
      let texto: string | null = null;
      if (c && c.aniversario.faltan === 0 && c.aniversario.anios > 0) {
        texto = `¡Hoy hace ${c.aniversario.anios} año${c.aniversario.anios === 1 ? "" : "s"} que estáis juntas!`;
      } else if (c && c.dias > 0 && c.dias % 100 === 0) {
        texto = `¡Hoy cumplís ${c.dias.toLocaleString("es-ES")} días juntas!`;
      }
      if (texto) {
        for (const s of d.suscripciones) {
          if (quiere(s, "aniversario")) salida.push({ cuando: iso, dispositivo: s.id, aviso: { t: "💜 Merviri", b: texto, r: "inicio", e: `aniversario-${dia}` } });
        }
      }
    }
  }
  salida.push(...recordatoriosEventos(d.eventos ?? [], d.suscripciones, d.ahora, d.hoy, d.dias ?? 7));
  return salida.sort((a, b) => a.cuando.localeCompare(b.cuando) || a.dispositivo.localeCompare(b.dispositivo) || a.aviso.e.localeCompare(b.aviso.e));
}

/** Recordatorios de los eventos que lo piden (la víspera, ese día o un rato antes). */
function recordatoriosEventos(eventos: Evento[], subs: Suscripcion[], ahora: Date, hoyF: Fecha, dias: number): EntradaPlan[] {
  const salida: EntradaPlan[] = [];
  for (const e of eventos) {
    if (!e.aviso || e.aviso === "ninguno") continue;
    for (const o of ocurrencias(e, hoyF, sumarDias(hoyF, dias))) {
      let cuando: Date;
      let t: string;
      if (e.aviso === "vispera") {
        cuando = instanteMadrid(sumarDias(o.dia, -1), "20:00");
        t = `📅 Mañana: ${e.titulo}`;
      } else if (e.aviso === "manana" || e.todoElDia || !e.horaInicio) {
        cuando = instanteMadrid(o.dia, "09:00");
        t = `📅 Hoy: ${e.titulo}`;
      } else {
        cuando = new Date(instanteMadrid(o.dia, e.horaInicio).getTime() - 2 * 3600 * 1000);
        t = `📅 ${e.titulo} a las ${e.horaInicio}`;
      }
      if (cuando.getTime() <= ahora.getTime()) continue;
      const b = [e.todoElDia || !e.horaInicio ? "" : `A las ${e.horaInicio}`, e.lugar ?? ""].filter(Boolean).join(" · ");
      for (const s of subs) {
        if (!esDe(e, s.persona) || !quiere(s, "evento")) continue;
        // El resumen de las 9:00 ya lo incluye: no se repite.
        if (e.aviso === "manana" && quiere(s, "manana")) continue;
        salida.push({ cuando: cuando.toISOString(), dispositivo: s.id, aviso: { t, b, r: "calendario", e: `evento-${e.id}-${o.dia}` } });
      }
    }
  }
  return salida;
}

/** Formato de `avisos/programados.json` (lo lee el flujo de GitHub Actions). */
export interface EnvioCifrado {
  endpoint: string;
  /** Aviso cifrado para ese dispositivo (Base64 URL). */
  cuerpo: string;
  ttl: number;
  urgencia: "very-low" | "low" | "normal" | "high";
}

export interface Programados {
  version: 1;
  envios: (EnvioCifrado & { cuando: string })[];
}
