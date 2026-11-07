import { esFecha, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";

/**
 * Planes y deseos: cosas que queréis hacer, con todo lo que hace falta para
 * decidir (plazo, dificultad, duración, coste, reserva, clima, temporada…).
 * Las ganas de cada una van aparte (`datos/ganas.json`) para no pisarse.
 */
export const RUTA_PLANES = "datos/planes.json";
export const RUTA_GANAS = "datos/ganas.json";

export type Plazo = "corto" | "medio" | "largo";
export type Dificultad = "facil" | "media" | "dificil";
export type Duracion = "rato" | "media" | "dia" | "finde" | "viaje";
export type Coste = "gratis" | "bajo" | "medio" | "alto";
export type Clima = "da-igual" | "sin-lluvia" | "sol" | "frio";
export type Momento = "manana" | "tarde" | "noche";
export type Sitio = "casa" | "ciudad" | "cerca" | "lejos";
export type EstadoPlan = "idea" | "planificado" | "hecho" | "descartado";

export const PLAZOS: { id: Plazo; texto: string }[] = [
  { id: "corto", texto: "Pronto" }, { id: "medio", texto: "Este año" }, { id: "largo", texto: "Algún día" },
];
export const DIFICULTADES: { id: Dificultad; texto: string }[] = [
  { id: "facil", texto: "Fácil" }, { id: "media", texto: "Media" }, { id: "dificil", texto: "Difícil" },
];
export const DURACIONES: { id: Duracion; texto: string; horas: number }[] = [
  { id: "rato", texto: "Un rato (1–2 h)", horas: 2 },
  { id: "media", texto: "Media jornada", horas: 4.5 },
  { id: "dia", texto: "Un día", horas: 9 },
  { id: "finde", texto: "Un fin de semana", horas: 48 },
  { id: "viaje", texto: "Varios días", horas: 72 },
];
export const COSTES: { id: Coste; texto: string; simbolo: string }[] = [
  { id: "gratis", texto: "Gratis", simbolo: "Gratis" }, { id: "bajo", texto: "Barato", simbolo: "€" },
  { id: "medio", texto: "Normal", simbolo: "€€" }, { id: "alto", texto: "Caro", simbolo: "€€€" },
];
export const CLIMAS: { id: Clima; texto: string; emoji: string }[] = [
  { id: "da-igual", texto: "Da igual (a cubierto)", emoji: "🏠" },
  { id: "sin-lluvia", texto: "Sin lluvia", emoji: "🌤️" },
  { id: "sol", texto: "Sol y buen tiempo", emoji: "☀️" },
  { id: "frio", texto: "Frío o nieve", emoji: "❄️" },
];
export const MOMENTOS: { id: Momento; texto: string }[] = [
  { id: "manana", texto: "Mañana" }, { id: "tarde", texto: "Tarde" }, { id: "noche", texto: "Noche" },
];
export const SITIOS: { id: Sitio; texto: string }[] = [
  { id: "casa", texto: "En casa" }, { id: "ciudad", texto: "En Valladolid" }, { id: "cerca", texto: "Cerca (≤ 1 h)" }, { id: "lejos", texto: "Lejos" },
];

export interface Lugar {
  nombre: string;
  lat: number | null;
  lon: number | null;
}

export interface Plan {
  id: string;
  titulo: string;
  notas: string | null;
  enlace: string | null;
  plazo: Plazo;
  dificultad: Dificultad;
  duracion: Duracion;
  coste: Coste;
  /** Importe aproximado para las dos (opcional). */
  importe: number | null;
  /** Días de antelación para reservar (0 = no hace falta). */
  reservaDias: number;
  clima: Clima;
  /** Meses en que se puede (1–12); vacío = cualquiera. */
  meses: number[];
  /** Fechas concretas (un festival, una exposición). */
  desde: Fecha | null;
  hasta: Fecha | null;
  momentos: Momento[];
  sitio: Sitio;
  lugar: Lugar | null;
  etiquetas: string[];
  estado: EstadoPlan;
  repetible: boolean;
  /** Si está en el calendario: id del evento y su fecha. */
  eventoId: string | null;
  fecha: Fecha | null;
  hechoEn: Fecha | null;
  valoracion: number | null;
  comentario: string | null;
}

export interface Ganas {
  id: string;
  plan: string;
  persona: IdPersona;
  /** 0 = nada … 3 = muchísimas. */
  ganas: number;
}

export const idGanas = (plan: string, persona: IdPersona) => `${plan}:${persona}`;

export const PLAN_VACIO: Omit<Plan, "id" | "titulo"> = {
  notas: null, enlace: null, plazo: "corto", dificultad: "facil", duracion: "media", coste: "bajo", importe: null,
  reservaDias: 0, clima: "da-igual", meses: [], desde: null, hasta: null, momentos: [], sitio: "ciudad", lugar: null,
  etiquetas: [], estado: "idea", repetible: false, eventoId: null, fecha: null, hechoEn: null, valoracion: null, comentario: null,
};

export function problemaPlan(p: Plan): string | null {
  const t = p.titulo.trim();
  if (!t) return "Ponle un nombre al plan.";
  if (t.length > 120) return "El nombre puede tener como mucho 120 caracteres.";
  if (p.enlace && !/^https?:\/\/\S+$/i.test(p.enlace)) return "El enlace tiene que empezar por http:// o https://.";
  if (!Number.isInteger(p.reservaDias) || p.reservaDias < 0 || p.reservaDias > 365) return "La antelación de la reserva no es válida.";
  if (p.importe !== null && (!Number.isFinite(p.importe) || p.importe < 0)) return "El importe no es válido.";
  if ((p.desde && !esFecha(p.desde)) || (p.hasta && !esFecha(p.hasta))) return "Las fechas no son válidas.";
  if (p.desde && p.hasta && p.hasta < p.desde) return "La fecha final es antes que la inicial.";
  if (p.meses.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) return "Los meses no son válidos.";
  return null;
}

/** Ganas de las dos (si alguna no ha votado, cuenta 1: «me da igual»). */
export function ganasDe(ganas: Ganas[], plan: string): Record<IdPersona, number | null> {
  const g = (p: IdPersona) => ganas.find((x) => x.plan === plan && x.persona === p)?.ganas ?? null;
  return { p1: g("p1"), p2: g("p2") };
}

export const sumaGanas = (g: Record<IdPersona, number | null>) => (g.p1 ?? 1) + (g.p2 ?? 1);

export interface FiltroPlanes {
  texto: string;
  plazo: Plazo | null;
  facil: boolean;
  gratis: boolean;
  corto: boolean;
  cubierto: boolean;
}

export const FILTRO_INICIAL: FiltroPlanes = { texto: "", plazo: null, facil: false, gratis: false, corto: false, cubierto: false };

export function filtrar<P extends Plan>(planes: P[], f: FiltroPlanes): P[] {
  const t = f.texto.trim().toLowerCase();
  return planes.filter((p) =>
    (!t || p.titulo.toLowerCase().includes(t) || p.etiquetas.some((e) => e.toLowerCase().includes(t)) || (p.notas ?? "").toLowerCase().includes(t)) &&
    (!f.plazo || p.plazo === f.plazo) &&
    (!f.facil || p.dificultad === "facil") &&
    (!f.gratis || p.coste === "gratis") &&
    (!f.corto || p.duracion === "rato" || p.duracion === "media") &&
    (!f.cubierto || p.clima === "da-igual"));
}

/** ¿Se puede hacer en esta fecha (temporada y fechas fijas)? */
export function encajaFecha(p: Plan, f: Fecha): boolean {
  if (p.meses.length && !p.meses.includes(+f.slice(5, 7))) return false;
  if (p.desde && f < p.desde) return false;
  if (p.hasta && f > p.hasta) return false;
  return true;
}

export const textoReserva = (dias: number) =>
  dias <= 0 ? "" : dias < 7 ? `Reservar ${dias} día${dias === 1 ? "" : "s"} antes` : dias % 7 === 0 ? `Reservar ${dias / 7} semana${dias === 7 ? "" : "s"} antes` : `Reservar ${dias} días antes`;
