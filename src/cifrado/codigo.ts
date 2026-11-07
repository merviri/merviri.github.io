import { aleatorios } from "../util/bytes";

/**
 * Código de recuperación: 20 bytes aleatorios (160 bits) escritos en Base32
 * de Crockford (sin I, L, O ni U para no confundir letras y números), en 8
 * grupos de 4: «K7QM-2D9X-…». Al leerlo se perdonan minúsculas, espacios,
 * guiones y las confusiones O→0, I/L→1.
 */
const ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LONGITUD_CODIGO = 32;

export function generarCodigo(): string {
  const bytes = aleatorios(20);
  let bits = 0;
  let valor = 0;
  let out = "";
  for (const b of bytes) {
    valor = ((valor << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatearCodigo(out);
}

export function formatearCodigo(normalizado: string): string {
  return normalizado.match(/.{1,4}/g)?.join("-") ?? normalizado;
}

/** Devuelve el código en su forma canónica (32 caracteres) o null si no es válido. */
export function normalizarCodigo(texto: string): string | null {
  const limpio = texto
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (limpio.length !== LONGITUD_CODIGO) return null;
  for (const c of limpio) if (!ALFABETO.includes(c)) return null;
  return limpio;
}
