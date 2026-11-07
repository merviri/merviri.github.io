/** Conversión entre texto, bytes y Base64 (estándar y para URL). */

export const utf8 = (texto: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(texto) as Uint8Array<ArrayBuffer>;
export const desdeUtf8 = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export function aBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Acepta Base64 con saltos de línea (como lo devuelve GitHub). */
export function desdeBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const aBase64Url = (bytes: Uint8Array): string =>
  aBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function desdeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(texto)) throw new Error("Código con caracteres no válidos.");
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  return desdeBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

export function aleatorios(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export const aHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function unir(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
}

export async function sha256Hex(texto: string): Promise<string> {
  return aHex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(texto))));
}

/** Identificador aleatorio corto (para registros, dispositivos, operaciones). */
export const nuevoId = (): string => aBase64Url(aleatorios(12));
