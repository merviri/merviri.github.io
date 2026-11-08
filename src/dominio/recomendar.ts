import { diaSemana, esLibre, horarioDelDia, intervaloEnDia, ocurrencias, type Evento, type Horario } from "./calendario";
import { diasEntre, sumarDias, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";
import { encajaFecha, ganasDe, sumaGanas, type Duracion, type Ganas, type Momento, type Plan } from "./planes";

/**
 * «¿Qué hacemos?»: busca huecos en los que estéis libres las dos (según el
 * calendario y el horario habitual de cada una) y les pone planes que caben
 * por duración, momento del día, temporada, reserva y tiempo previsto.
 * Funciones puras: el tiempo lo da quien llama.
 */

export interface Prevision {
  fecha: Fecha;
  /** Código del tiempo (WMO): 0 despejado … 95+ tormenta. */
  codigo: number;
  max: number;
  min: number;
  /** Probabilidad de lluvia (%). */
  lluvia: number;
}

/** Horas «útiles» del día para planes: de 9:00 a 23:00. */
export const DIA_DESDE = 9 * 60;
export const DIA_HASTA = 23 * 60;

type Intervalo = [number, number];

const min = (h: string) => +h.slice(0, 2) * 60 + +h.slice(3, 5);

/**
 * Ratos ocupados de una persona un día: eventos suyos o de las dos, y su
 * horario habitual (menos sus vacaciones o ratos libres, que no ocupan).
 */
export function ocupado(dia: Fecha, persona: IdPersona, eventos: Evento[], horario: Horario | undefined): Intervalo[] {
  const out: Intervalo[] = [];
  for (const e of eventos) {
    if (e.quien !== persona && e.quien !== "ambas") continue;
    if (esLibre(e)) continue;
    for (const o of ocurrencias(e, dia, dia)) {
      if ((e.todoElDia || !e.horaInicio) && e.categoria === "cumple") continue;
      out.push(intervaloEnDia(e, o, dia));
    }
  }
  for (const t of horarioDelDia(horario, dia, persona, eventos)) out.push([t.desde, t.hasta]);
  return out;
}

/** Huecos libres de las dos en [9:00, 23:00]. */
export function libresComunes(dia: Fecha, eventos: Evento[], horarios: Partial<Record<IdPersona, Horario>>): Intervalo[] {
  const ocup = [...ocupado(dia, "p1", eventos, horarios.p1), ...ocupado(dia, "p2", eventos, horarios.p2)].sort((a, b) => a[0] - b[0]);
  const libres: Intervalo[] = [];
  let cursor = DIA_DESDE;
  for (const [a, b] of ocup) {
    if (b <= cursor) continue;
    if (a > cursor) libres.push([cursor, Math.min(a, DIA_HASTA)]);
    cursor = Math.max(cursor, b);
    if (cursor >= DIA_HASTA) break;
  }
  if (cursor < DIA_HASTA) libres.push([cursor, DIA_HASTA]);
  return libres.filter(([a, b]) => b - a > 0);
}

export interface Hueco {
  dia: Fecha;
  /** Último día (para fin de semana o viaje). */
  hastaDia: Fecha;
  desde: number;
  hasta: number;
  tipo: Duracion;
}

const RANGO: Record<Duracion, number> = { rato: 0, media: 1, dia: 2, finde: 3, viaje: 4 };

export function huecos(desde: Fecha, dias: number, eventos: Evento[], horarios: Partial<Record<IdPersona, Horario>>): Hueco[] {
  const out: Hueco[] = [];
  const diaLibre = new Map<Fecha, boolean>();
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(desde, i);
    let completo = false;
    for (const [a, b] of libresComunes(dia, eventos, horarios)) {
      const largo = b - a;
      const tipo: Duracion | null = largo >= 9 * 60 ? "dia" : largo >= 4.5 * 60 ? "media" : largo >= 90 ? "rato" : null;
      if (!tipo) continue;
      if (tipo === "dia") completo = true;
      out.push({ dia, hastaDia: dia, desde: a, hasta: b, tipo });
    }
    diaLibre.set(dia, completo);
  }
  // Fines de semana libres enteros y tramos de 3 o más días libres (puentes, vacaciones).
  let racha: Fecha[] = [];
  const cerrarRacha = () => {
    if (racha.length >= 3) out.push({ dia: racha[0]!, hastaDia: racha[racha.length - 1]!, desde: DIA_DESDE, hasta: DIA_HASTA, tipo: "viaje" });
    racha = [];
  };
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(desde, i);
    if (diaSemana(dia) === 6 && diaLibre.get(dia) && diaLibre.get(sumarDias(dia, 1))) {
      out.push({ dia, hastaDia: sumarDias(dia, 1), desde: DIA_DESDE, hasta: DIA_HASTA, tipo: "finde" });
    }
    if (diaLibre.get(dia)) racha.push(dia);
    else cerrarRacha();
  }
  cerrarRacha();
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.desde - b.desde);
}

export function cabe(plan: Duracion, hueco: Duracion): boolean {
  if (plan === "finde" || plan === "viaje") return RANGO[hueco] >= RANGO[plan];
  return RANGO[hueco] >= RANGO[plan] && RANGO[hueco] <= RANGO.dia;
}

export function momentosDe(h: Pick<Hueco, "desde" | "hasta" | "tipo">): Momento[] {
  if (h.tipo === "finde" || h.tipo === "viaje") return ["manana", "tarde", "noche"];
  const solapa = (a: number, b: number) => Math.min(h.hasta, b) - Math.max(h.desde, a) >= 60;
  const out: Momento[] = [];
  if (solapa(9 * 60, 14 * 60)) out.push("manana");
  if (solapa(14 * 60, 20 * 60)) out.push("tarde");
  if (solapa(20 * 60, 23 * 60)) out.push("noche");
  return out;
}

/** ¿Acompaña el tiempo? null = no hay previsión todavía. */
export function tiempoEncaja(clima: Plan["clima"], p: Prevision | null): boolean | null {
  if (clima === "da-igual") return true;
  if (!p) return null;
  // Códigos WMO: 51 en adelante es llovizna, lluvia, nieve, chubascos o tormenta.
  if (clima === "sin-lluvia") return p.lluvia <= 40 && p.codigo < 51;
  if (clima === "sol") return p.codigo <= 2 && p.max >= 17 && p.lluvia <= 30;
  return p.max <= 8;
}

export interface Sugerencia<P extends Plan = Plan> {
  plan: P;
  hueco: Hueco;
  prevision: Prevision | null;
  puntos: number;
  /** Día límite para reservar (si hace falta). */
  reservarAntesDe: Fecha | null;
}

export function recomendar<P extends Plan>(d: {
  planes: P[];
  ganas: Ganas[];
  eventos: Evento[];
  horarios: Partial<Record<IdPersona, Horario>>;
  hoy: Fecha;
  dias?: number;
  tiempo: (plan: P, fecha: Fecha) => Prevision | null;
  descartados?: Set<string>;
  max?: number;
}): Sugerencia<P>[] {
  const lista = huecos(d.hoy, d.dias ?? 21, d.eventos, d.horarios);
  const out: Sugerencia<P>[] = [];
  for (const plan of d.planes) {
    if (plan.estado !== "idea" || d.descartados?.has(plan.id)) continue;
    const g = sumaGanas(ganasDe(d.ganas, plan.id));
    if (g === 0) continue; // ninguna de las dos tiene ganas
    let mejor: Sugerencia<P> | null = null;
    for (const h of lista) {
      if (!cabe(plan.duracion, h.tipo)) continue;
      if (plan.momentos.length && !plan.momentos.some((m) => momentosDe(h).includes(m))) continue;
      if (!encajaFecha(plan, h.dia) || !encajaFecha(plan, h.hastaDia)) continue;
      const distancia = diasEntre(d.hoy, h.dia);
      if (plan.reservaDias > distancia) continue; // ya no da tiempo a reservar
      const prev = d.tiempo(plan, h.dia);
      const t = tiempoEncaja(plan.clima, prev);
      if (t === false) continue;
      const puntos = 2 * g
        + ({ corto: 3, medio: 2, largo: 1 } as const)[plan.plazo]
        + ({ gratis: 1, bajo: 0.5, medio: 0, alto: -0.5 } as const)[plan.coste]
        + (t === true && plan.clima !== "da-igual" ? 1 : 0)
        - (plan.dificultad === "dificil" ? 1 : plan.dificultad === "media" ? 0.3 : 0)
        + (plan.duracion === h.tipo ? 0.5 : 0)
        - distancia * 0.05;
      if (!mejor || puntos > mejor.puntos) {
        mejor = {
          plan, hueco: h, prevision: prev, puntos,
          reservarAntesDe: plan.reservaDias > 0 ? sumarDias(h.dia, -plan.reservaDias) : null,
        };
      }
    }
    if (mejor) out.push(mejor);
  }
  return out.sort((a, b) => b.puntos - a.puntos).slice(0, d.max ?? 8);
}

export const textoMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Emoji y texto del tiempo (código WMO). */
export function emojiTiempo(codigo: number): string {
  if (codigo === 0) return "☀️";
  if (codigo <= 2) return "🌤️";
  if (codigo === 3) return "☁️";
  if (codigo <= 48) return "🌫️";
  if (codigo <= 67 || (codigo >= 80 && codigo <= 82)) return "🌧️";
  if (codigo <= 77 || codigo === 85 || codigo === 86) return "❄️";
  return "⛈️";
}
