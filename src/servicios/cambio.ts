/**
 * Tipo de cambio del Banco Central Europeo (Frankfurter: gratis, sin clave).
 * https://frankfurter.dev — solo se envían las dos monedas.
 */
const cache = new Map<string, { cuando: number; valor: number }>();

export async function tipoDeCambio(de: string, a: string): Promise<number> {
  if (de === a) return 1;
  const k = `${de}-${a}`;
  const c = cache.get(k);
  if (c && Date.now() - c.cuando < 6 * 3600 * 1000) return c.valor;
  if (!/^[A-Z]{3}$/.test(de) || !/^[A-Z]{3}$/.test(a)) throw new Error("Moneda no válida.");
  const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${de}&symbols=${a}`, { referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error("No se pudo consultar el cambio. Escríbelo a mano.");
  const j = (await res.json()) as { rates?: Record<string, number> };
  const v = j.rates?.[a];
  if (typeof v !== "number" || !(v > 0)) throw new Error("No hay cambio para esa moneda. Escríbelo a mano.");
  cache.set(k, { cuando: Date.now(), valor: v });
  return v;
}
