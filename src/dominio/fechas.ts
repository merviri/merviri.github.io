/**
 * Fechas «de calendario» (AAAA-MM-DD) en la hora de Madrid. Las cuentas de
 * días se hacen en UTC sobre la fecha, sin horas, para que los cambios de
 * hora no descuadren nada.
 */
export const ZONA = "Europe/Madrid";

export type Fecha = string;

export function esFecha(x: unknown): x is Fecha {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}

/** Fecha de hoy en Madrid. */
export function hoy(ahora: Date = new Date()): Fecha {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(ahora);
  const v = (t: string) => p.find((x) => x.type === t)!.value;
  return `${v("year")}-${v("month")}-${v("day")}`;
}

const ms = (f: Fecha) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));

export function diasEntre(desde: Fecha, hasta: Fecha): number {
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

export function sumarDias(f: Fecha, n: number): Fecha {
  return new Date(ms(f) + n * 86_400_000).toISOString().slice(0, 10);
}

/** El mismo día y mes en otro año (el 29 de febrero pasa al 28 si el año no es bisiesto). */
export function mismoDiaEnAnio(f: Fecha, anio: number): Fecha {
  const mes = +f.slice(5, 7);
  let dia = +f.slice(8, 10);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  if (dia > ultimo) dia = ultimo;
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const NOMBRE_FECHA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const NOMBRE_FECHA_CORTA = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });

export const fechaLarga = (f: Fecha) => NOMBRE_FECHA.format(new Date(ms(f)));
export const fechaCorta = (f: Fecha) => NOMBRE_FECHA_CORTA.format(new Date(ms(f)));

/** «hace un momento», «hace 5 min», «hace 3 h», «ayer», «el 4 de noviembre». */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const s = Math.round((ahora.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  const d = diasEntre(hoy(new Date(iso)), hoy(ahora));
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return `el ${fechaCorta(hoy(new Date(iso)))}`;
}
