import { esFecha, type Fecha } from "./fechas";
import type { IdPersona } from "./pareja";

/**
 * Gastos compartidos al estilo Tricount.
 *  - Botes en `datos/gastos/botes.json` («Casa», «Viaje a Lisboa»…), cada uno
 *    con sus participantes: las dos y, si queréis, amigos (solo el nombre).
 *  - Los gastos de cada bote en `datos/gastos/<bote>.json`.
 *  - Gastos fijos (alquiler, luz…) en `datos/gastos/fijos.json`: cada mes se
 *    apuntan solos con un id fijo, así nunca se duplican aunque los creen
 *    los dos móviles a la vez.
 * Todos los importes van en céntimos (enteros) para no perder decimales.
 */
export const RUTA_BOTES = "datos/gastos/botes.json";
export const RUTA_FIJOS = "datos/gastos/fijos.json";
export const rutaGastos = (bote: string) => `datos/gastos/${bote}.json`;
export const ID_CASA = "casa";

export interface Participante {
  /** "p1", "p2" o un id de amigo. */
  id: string;
  nombre: string;
}

export interface Bote {
  id: string;
  nombre: string;
  emoji: string;
  moneda: string;
  /** Amigos (además de las dos). */
  amigos: Participante[];
  archivado: boolean;
}

export type ModoReparto = "iguales" | "partes" | "importes";

export interface Reparto {
  modo: ModoReparto;
  /** participante → peso (iguales: 1; partes: nº de partes; importes: céntimos). */
  entre: Record<string, number>;
}

export type TipoMovimiento = "gasto" | "transferencia";

export interface Gasto {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  /** Céntimos en la moneda del bote. */
  importe: number;
  /** Si se pagó en otra moneda: importe original (céntimos), moneda y cambio usado. */
  original: { importe: number; moneda: string; cambio: number } | null;
  pagadoPor: string;
  /** Gasto: entre quién se reparte. Transferencia: a quién se paga (una sola persona). */
  reparto: Reparto;
  fecha: Fecha;
  categoria: CategoriaGasto;
  nota: string | null;
  /** Si viene de un gasto fijo. */
  fijo: string | null;
}

export type CategoriaGasto = "compra" | "casa" | "facturas" | "restaurantes" | "transporte" | "viajes" | "regalos" | "ocio" | "salud" | "mascotas" | "otros";
export const CATEGORIAS_GASTO: { id: CategoriaGasto; emoji: string; nombre: string }[] = [
  { id: "compra", emoji: "🛒", nombre: "Compra" },
  { id: "casa", emoji: "🏠", nombre: "Casa" },
  { id: "facturas", emoji: "💡", nombre: "Facturas" },
  { id: "restaurantes", emoji: "🍽️", nombre: "Restaurantes" },
  { id: "transporte", emoji: "🚗", nombre: "Transporte" },
  { id: "viajes", emoji: "✈️", nombre: "Viajes" },
  { id: "regalos", emoji: "🎁", nombre: "Regalos" },
  { id: "ocio", emoji: "🎉", nombre: "Ocio" },
  { id: "salud", emoji: "💊", nombre: "Salud" },
  { id: "mascotas", emoji: "🐾", nombre: "Mascotas" },
  { id: "otros", emoji: "📦", nombre: "Otros" },
];
export const emojiGasto = (c: CategoriaGasto) => CATEGORIAS_GASTO.find((x) => x.id === c)?.emoji ?? "📦";

export interface GastoFijo {
  id: string;
  bote: string;
  concepto: string;
  importe: number;
  pagadoPor: string;
  reparto: Reparto;
  categoria: CategoriaGasto;
  /** Día del mes (1–28) en que se apunta. */
  dia: number;
  activo: boolean;
}

export const MONEDAS = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "JPY", "MXN", "CAD", "AUD"];

// ---------------------------------------------------------------------------
// Importes
// ---------------------------------------------------------------------------

/** «12,50», «12.5», «1.234,56» → céntimos (o null si no es un importe). */
export function leerImporte(texto: string): number | null {
  let t = texto.trim().replace(/\s|€/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else t = t.replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return Number.isFinite(c) ? c : null;
}

const formatos = new Map<string, Intl.NumberFormat>();
export function dinero(centimos: number, moneda = "EUR"): string {
  let f = formatos.get(moneda);
  if (!f) {
    f = new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda, minimumFractionDigits: 2 });
    formatos.set(moneda, f);
  }
  return f.format(centimos / 100);
}

// ---------------------------------------------------------------------------
// Repartos y saldos
// ---------------------------------------------------------------------------

/** Lo que le toca a cada uno de un gasto (céntimos; suman exactamente el importe). */
export function partes(g: Pick<Gasto, "importe" | "reparto">): Record<string, number> {
  const ids = Object.keys(g.reparto.entre).filter((k) => (g.reparto.entre[k] ?? 0) > 0).sort();
  const out: Record<string, number> = {};
  if (!ids.length) return out;
  if (g.reparto.modo === "importes") {
    for (const id of ids) out[id] = Math.round(g.reparto.entre[id]!);
    return out;
  }
  const pesos = ids.map((id) => (g.reparto.modo === "iguales" ? 1 : g.reparto.entre[id]!));
  const total = pesos.reduce((a, b) => a + b, 0);
  let repartido = 0;
  ids.forEach((id, i) => {
    out[id] = Math.floor((g.importe * pesos[i]!) / total);
    repartido += out[id]!;
  });
  // Los céntimos que sobran, de uno en uno, por orden (siempre el mismo resultado).
  for (let i = 0; repartido < g.importe; i = (i + 1) % ids.length) {
    out[ids[i]!]! += 1;
    repartido++;
  }
  return out;
}

export function problemaGasto(g: Gasto, participantes: string[]): string | null {
  if (g.tipo === "gasto" && !g.concepto.trim()) return "Escribe en qué se ha gastado.";
  if (!Number.isInteger(g.importe) || g.importe <= 0) return "El importe tiene que ser mayor que cero.";
  if (g.importe > 100_000_000) return "Ese importe es demasiado grande.";
  if (!participantes.includes(g.pagadoPor)) return "Elige quién ha pagado.";
  if (!esFecha(g.fecha)) return "La fecha no es válida.";
  const ids = Object.keys(g.reparto.entre).filter((k) => (g.reparto.entre[k] ?? 0) > 0);
  if (!ids.length) return "Elige para quién es.";
  if (ids.some((id) => !participantes.includes(id))) return "Hay alguien en el reparto que no está en el bote.";
  if (g.tipo === "transferencia" && (ids.length !== 1 || ids[0] === g.pagadoPor)) return "Una transferencia es de una persona a otra.";
  if (g.reparto.modo === "importes") {
    const suma = ids.reduce((a, id) => a + g.reparto.entre[id]!, 0);
    if (suma !== g.importe) return `Los importes suman ${dinero(suma)} y el gasto es de ${dinero(g.importe)}.`;
  }
  return null;
}

/** Saldo de cada participante: positivo = le deben; negativo = debe. */
export function saldos(gastos: Gasto[], participantes: string[]): Record<string, number> {
  const s: Record<string, number> = Object.fromEntries(participantes.map((p) => [p, 0]));
  for (const g of gastos) {
    s[g.pagadoPor] = (s[g.pagadoPor] ?? 0) + g.importe;
    for (const [p, c] of Object.entries(partes(g))) s[p] = (s[p] ?? 0) - c;
  }
  return s;
}

export interface Pago {
  de: string;
  a: string;
  importe: number;
}

/** Cómo saldar con el menor número de pagos (el que más debe paga al que más le deben). */
export function comoSaldar(s: Record<string, number>): Pago[] {
  const deudores = Object.entries(s).filter(([, v]) => v < 0).map(([k, v]) => ({ k, v: -v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const acreedores = Object.entries(s).filter(([, v]) => v > 0).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k));
  const pagos: Pago[] = [];
  let i = 0;
  let j = 0;
  while (i < deudores.length && j < acreedores.length) {
    const x = Math.min(deudores[i]!.v, acreedores[j]!.v);
    if (x > 0) pagos.push({ de: deudores[i]!.k, a: acreedores[j]!.k, importe: x });
    deudores[i]!.v -= x;
    acreedores[j]!.v -= x;
    if (deudores[i]!.v === 0) i++;
    if (acreedores[j]!.v === 0) j++;
  }
  return pagos;
}

/** Total por categoría (solo gastos, no transferencias) y por quién pagó. */
export function resumen(gastos: Gasto[]) {
  const porCategoria = new Map<CategoriaGasto, number>();
  const porQuien = new Map<string, number>();
  let total = 0;
  for (const g of gastos) {
    if (g.tipo !== "gasto") continue;
    total += g.importe;
    porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.importe);
    porQuien.set(g.pagadoPor, (porQuien.get(g.pagadoPor) ?? 0) + g.importe);
  }
  return { total, porCategoria: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]), porQuien };
}

// ---------------------------------------------------------------------------
// Gastos fijos
// ---------------------------------------------------------------------------

export const idDeFijo = (fijo: string, mes: string) => `fijo-${fijo}-${mes}`;

/** Gastos de los fijos que tocan este mes (si ya ha llegado su día). */
export function gastosFijosDelMes(fijos: GastoFijo[], hoyF: Fecha): Gasto[] {
  const mes = hoyF.slice(0, 7);
  const dia = +hoyF.slice(8, 10);
  return fijos.filter((f) => f.activo && f.dia <= dia).map((f) => ({
    id: idDeFijo(f.id, mes), tipo: "gasto", concepto: f.concepto, importe: f.importe, original: null,
    pagadoPor: f.pagadoPor, reparto: f.reparto, fecha: `${mes}-${String(f.dia).padStart(2, "0")}`,
    categoria: f.categoria, nota: null, fijo: f.id,
  }));
}

// ---------------------------------------------------------------------------
// Participantes y exportar
// ---------------------------------------------------------------------------

export function participantes(b: Bote, nombres: Record<IdPersona, string>): Participante[] {
  return [{ id: "p1", nombre: nombres.p1 }, { id: "p2", nombre: nombres.p2 }, ...b.amigos];
}

const csv = (x: string) => (/[;"\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);

export function exportarCsv(gastos: Gasto[], nombre: (id: string) => string, moneda: string): string {
  const filas = [["Fecha", "Tipo", "Concepto", "Categoría", `Importe (${moneda})`, "Pagó", "Para", "Nota"].join(";")];
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const para = Object.entries(partes(g)).map(([p, c]) => `${nombre(p)} ${(c / 100).toFixed(2).replace(".", ",")}`).join(", ");
    filas.push([g.fecha, g.tipo === "gasto" ? "Gasto" : "Transferencia", csv(g.concepto), CATEGORIAS_GASTO.find((c) => c.id === g.categoria)?.nombre ?? "",
      (g.importe / 100).toFixed(2).replace(".", ","), csv(nombre(g.pagadoPor)), csv(para), csv(g.nota ?? "")].join(";"));
  }
  return `﻿${filas.join("\r\n")}\r\n`;
}
