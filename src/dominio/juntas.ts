import { diasEntre, esFecha, mismoDiaEnAnio, sumarDias, type Fecha } from "./fechas";
import { otraPersona, type IdPersona } from "./pareja";
import { PREGUNTAS } from "./preguntas";

/**
 * Cosas de pareja:
 *  - Pregunta del día: la respuesta de la otra se ve solo cuando contestas tú.
 *  - Decidir juntas: votación secreta; el resultado se ve cuando votáis las dos.
 *  - Cápsulas del tiempo: mensajes que no se pueden abrir hasta una fecha.
 *  - Fichas «bueno saber» de cada una (tallas, gustos…) y su cumpleaños.
 *  - Deseos de cada una, ideas de regalo secretas y «me lo pido» secreto.
 *  - Nuestro año: resumen de lo vivido.
 * Lo «secreto» lo oculta la app: los datos van cifrados, pero los reciben
 * los dos dispositivos. Cada una escribe sus propios registros (respuestas,
 * votos, reservas) para que nunca choquen.
 */
export const rutaRespuestas = (anio: number | string) => `datos/preguntas/${anio}.json`;
export const RUTA_VOTACIONES = "datos/votaciones.json";
export const RUTA_VOTOS = "datos/votos.json";
export const RUTA_CAPSULAS = "datos/capsulas.json";
export const RUTA_FICHAS = "datos/fichas.json";
export const RUTA_DESEOS = "datos/deseos.json";
export const RUTA_RESERVAS = "datos/reservas.json";

// ---------------------------------------------------------------------------
// Pregunta del día
// ---------------------------------------------------------------------------

const REF = "2026-01-01";
/** La pregunta de un día (la misma para las dos). */
export function preguntaDe(f: Fecha): { indice: number; texto: string } {
  const n = diasEntre(REF, f);
  const i = ((n % PREGUNTAS.length) + PREGUNTAS.length) % PREGUNTAS.length;
  return { indice: i, texto: PREGUNTAS[i]! };
}

export interface Respuesta {
  /** «AAAA-MM-DD:p1». */
  id: string;
  fecha: Fecha;
  persona: IdPersona;
  texto: string;
}

export const idRespuesta = (f: Fecha, p: IdPersona) => `${f}:${p}`;
export const LIMITE_RESPUESTA = 2000;

const valida = (r: Respuesta) => esFecha(r.fecha) && (r.persona === "p1" || r.persona === "p2") && typeof r.texto === "string" && !!r.texto.trim();

/** Lo que ve `yo` de la pregunta de un día: la respuesta de la otra solo si ya has contestado tú. */
export function estadoPregunta(respuestas: Respuesta[], f: Fecha, yo: IdPersona) {
  const de = (p: IdPersona) => respuestas.find((r) => r.fecha === f && r.persona === p && valida(r)) ?? null;
  const mia = de(yo);
  const suya = de(otraPersona(yo));
  return { mia, suya: mia ? suya : null, otraHaContestado: !!suya };
}

/** Días en que contestasteis las dos. */
export function diasContestadosPorLasDos(respuestas: Respuesta[]): Set<Fecha> {
  const ambas = new Set<Fecha>();
  const por = new Map<Fecha, Set<IdPersona>>();
  for (const r of respuestas) {
    if (!valida(r)) continue;
    const s = por.get(r.fecha) ?? new Set<IdPersona>();
    s.add(r.persona);
    por.set(r.fecha, s);
    if (s.size === 2) ambas.add(r.fecha);
  }
  return ambas;
}

/** Días seguidos (hasta hoy, o hasta ayer si hoy aún falta alguna) en que contestasteis las dos. */
export function racha(respuestas: Respuesta[], hoyF: Fecha): number {
  const ambas = diasContestadosPorLasDos(respuestas);
  let d = ambas.has(hoyF) ? hoyF : sumarDias(hoyF, -1);
  let n = 0;
  while (ambas.has(d)) { n++; d = sumarDias(d, -1); }
  return n;
}

// ---------------------------------------------------------------------------
// Decidir juntas
// ---------------------------------------------------------------------------

export interface Votacion {
  id: string;
  pregunta: string;
  opciones: string[];
  /** Si no coincidís: la opción que eligió el azar (índice) o null. */
  desempate: number | null;
  cerrada: boolean;
}

export interface Voto {
  /** «<votación>:p1». */
  id: string;
  votacion: string;
  persona: IdPersona;
  opcion: number;
}

export const idVoto = (votacion: string, p: IdPersona) => `${votacion}:${p}`;
export const MAX_OPCIONES = 6;

/** Estado de una votación vista por `yo`: el voto de la otra solo se ve cuando has votado tú. */
export function estadoVotacion(v: Votacion, votos: Voto[], yo: IdPersona) {
  const de = (p: IdPersona) => {
    const o = votos.find((x) => x.votacion === v.id && x.persona === p)?.opcion;
    return typeof o === "number" && Number.isInteger(o) && o >= 0 && o < v.opciones.length ? o : null;
  };
  const mio = de(yo);
  const suyo = de(otraPersona(yo));
  const completa = mio !== null && suyo !== null;
  const coinciden = completa && mio === suyo;
  const desempate = v.desempate !== null && (v.desempate === mio || v.desempate === suyo) ? v.desempate : null;
  const ganadora = !completa ? null : coinciden ? mio : desempate;
  return { mio, suyo: completa ? suyo : null, otraHaVotado: suyo !== null, completa, coinciden, ganadora };
}

/** Opciones escritas una por línea (sin vacías ni repetidas). */
export function leerOpciones(texto: string): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const l of texto.split(/\r?\n/)) {
    const o = l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim().slice(0, 80);
    if (!o || vistas.has(o.toLowerCase())) continue;
    vistas.add(o.toLowerCase());
    salida.push(o);
  }
  return salida;
}

export function problemaVotacion(pregunta: string, opciones: string[]): string | null {
  if (!pregunta.trim()) return "Escribe qué tenéis que decidir.";
  if (opciones.length < 2) return "Pon al menos dos opciones (una por línea).";
  if (opciones.length > MAX_OPCIONES) return `Como mucho ${MAX_OPCIONES} opciones.`;
  return null;
}

// ---------------------------------------------------------------------------
// Cápsulas del tiempo
// ---------------------------------------------------------------------------

export interface Capsula {
  id: string;
  para: IdPersona | "ambas";
  abrir: Fecha;
  titulo: string;
  mensaje: string;
}

export const capsulaAbierta = (c: Pick<Capsula, "abrir">, hoyF: Fecha) => c.abrir <= hoyF;
/** Quién la recibe: la destinataria, o las dos. */
export const esParaMi = (c: Pick<Capsula, "para">, yo: IdPersona) => c.para === yo || c.para === "ambas";

export function problemaCapsula(c: Capsula, hoyF: Fecha): string | null {
  if (!c.titulo.trim()) return "Ponle un título.";
  if (!c.mensaje.trim()) return "Escribe el mensaje.";
  if (!esFecha(c.abrir) || c.abrir <= hoyF) return "La fecha de apertura tiene que ser a partir de mañana.";
  return null;
}

/** Fechas rápidas para abrir una cápsula. */
export function fechasCapsula(hoyF: Fecha, juntasDesde: Fecha | null): { texto: string; fecha: Fecha }[] {
  const a = +hoyF.slice(0, 4);
  const salida: { texto: string; fecha: Fecha }[] = [
    { texto: "Dentro de un mes", fecha: sumarDias(hoyF, 30) },
    { texto: "Dentro de un año", fecha: mismoDiaEnAnio(hoyF, a + 1) },
    { texto: "Dentro de 5 años", fecha: mismoDiaEnAnio(hoyF, a + 5) },
    { texto: "Nochevieja", fecha: `${a}-12-31` > hoyF ? `${a}-12-31` : `${a + 1}-12-31` },
  ];
  if (juntasDesde && esFecha(juntasDesde)) {
    let f = mismoDiaEnAnio(juntasDesde, a);
    if (f <= hoyF) f = mismoDiaEnAnio(juntasDesde, a + 1);
    salida.splice(2, 0, { texto: "Próximo aniversario", fecha: f });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Fichas «bueno saber» y deseos
// ---------------------------------------------------------------------------

export interface CampoFicha {
  etiqueta: string;
  valor: string;
}

export interface Ficha {
  /** La persona de la ficha. */
  id: IdPersona;
  cumple: Fecha | null;
  campos: CampoFicha[];
}

export const CAMPOS_SUGERIDOS = [
  "Talla de camiseta", "Talla de pantalón", "Talla de zapato", "Talla de anillo", "Café", "Comida favorita", "Postre favorito",
  "No le gusta", "Alergias", "Flores favoritas", "Color favorito", "Perfume", "Libros o autoras", "Música", "Serie favorita",
];

export const fichaVacia = (id: IdPersona): Ficha => ({ id, cumple: null, campos: [] });

/** Limpia los campos: sin vacíos y sin etiquetas repetidas (gana la última). */
export function limpiarCampos(campos: CampoFicha[]): CampoFicha[] {
  const m = new Map<string, CampoFicha>();
  for (const c of campos) {
    const etiqueta = c.etiqueta.trim().slice(0, 60);
    const valor = c.valor.trim().slice(0, 300);
    if (!etiqueta || !valor) continue;
    m.delete(etiqueta.toLowerCase());
    m.set(etiqueta.toLowerCase(), { etiqueta, valor });
  }
  return [...m.values()];
}

export interface Deseo {
  id: string;
  /** De quién es el deseo. */
  de: IdPersona;
  titulo: string;
  enlace: string | null;
  precio: string | null;
  mucho: boolean;
  conseguido: boolean;
}

export interface Reserva {
  /** Id del deseo. */
  id: string;
  quien: IdPersona;
}

/** Un deseo apuntado por la otra («idea de regalo») no lo ve la dueña. Las reservas tampoco. */
export const deseoVisible = (d: Pick<Deseo, "de"> & { por: string }, yo: IdPersona) => d.de !== yo || d.por === yo;
export const esIdeaSecreta = (d: Pick<Deseo, "de"> & { por: string }) => d.por !== d.de;

/** Orden: primero los que más ilusión hacen, luego los más nuevos; los conseguidos al final. */
export function ordenarDeseos<T extends Deseo & { actualizado: string }>(ds: T[]): T[] {
  return [...ds].sort((a, b) => Number(a.conseguido) - Number(b.conseguido) || Number(b.mucho) - Number(a.mucho) || b.actualizado.localeCompare(a.actualizado));
}

/** Próximo cumpleaños de una persona (o null si no está puesto). */
export function proximoCumple(f: Pick<Ficha, "cumple"> | undefined, hoyF: Fecha): { fecha: Fecha; faltan: number; anios: number } | null {
  if (!f?.cumple || !esFecha(f.cumple)) return null;
  const a = +hoyF.slice(0, 4);
  let fecha = mismoDiaEnAnio(f.cumple, a);
  if (fecha < hoyF) fecha = mismoDiaEnAnio(f.cumple, a + 1);
  return { fecha, faltan: diasEntre(hoyF, fecha), anios: +fecha.slice(0, 4) - +f.cumple.slice(0, 4) };
}

/** Radar de regalos: se avisa cuando el cumple de la otra está a menos de estos días. */
export const RADAR_DIAS = 21;

// ---------------------------------------------------------------------------
// Nuestro año
// ---------------------------------------------------------------------------

export interface ResumenAnio {
  anio: number;
  planes: string[];
  fotos: number;
  /** «AAAA-MM» del mes con más fotos. */
  mesFotos: string | null;
  preguntas: number;
  dibujos: number;
  decisiones: number;
  capsulas: number;
}

export function resumenAnio(anio: number, d: {
  planes: { titulo: string; estado: string; hechoEn: Fecha | null }[];
  fotos: { fecha: Fecha; papelera: string | null }[];
  respuestas: Respuesta[];
  dibujos: { actualizado: string }[];
  votaciones: { id: string; actualizado: string }[];
  votos: Voto[];
  capsulas: { actualizado: string }[];
}): ResumenAnio {
  const a = String(anio);
  const planes = d.planes.filter((p) => p.estado === "hecho" && !!p.hechoEn?.startsWith(a))
    .sort((x, y) => (x.hechoEn ?? "").localeCompare(y.hechoEn ?? "")).map((p) => p.titulo);
  const fotos = d.fotos.filter((f) => !f.papelera && f.fecha.startsWith(a));
  const porMes = new Map<string, number>();
  for (const f of fotos) porMes.set(f.fecha.slice(0, 7), (porMes.get(f.fecha.slice(0, 7)) ?? 0) + 1);
  const mesFotos = [...porMes.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]?.[0] ?? null;
  const votantes = new Map<string, Set<IdPersona>>();
  for (const v of d.votos) votantes.set(v.votacion, (votantes.get(v.votacion) ?? new Set<IdPersona>()).add(v.persona));
  return {
    anio, planes, fotos: fotos.length, mesFotos,
    preguntas: diasContestadosPorLasDos(d.respuestas.filter((r) => r.fecha.startsWith(a))).size,
    dibujos: d.dibujos.filter((x) => x.actualizado.startsWith(a)).length,
    decisiones: d.votaciones.filter((v) => v.actualizado.startsWith(a) && (votantes.get(v.id)?.size ?? 0) >= 2).length,
    capsulas: d.capsulas.filter((c) => c.actualizado.startsWith(a)).length,
  };
}
