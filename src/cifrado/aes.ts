import { aleatorios } from "../util/bytes";
import { ErrorDescifrado } from "./errores";

/**
 * AES-GCM de 256 bits (WebCrypto). Cada cifrado usa un IV aleatorio de 12
 * bytes. Los "datos asociados" (aad) atan el cifrado a su sitio: un fichero
 * cifrado para una ruta no se puede hacer pasar por otro.
 */
export async function cifrar(clave: CryptoKey, datos: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>) {
  const iv = aleatorios(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, clave, datos));
  return { iv, ct };
}

export async function descifrar(
  clave: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ct: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, clave, ct));
  } catch {
    throw new ErrorDescifrado();
  }
}

/** Clave de datos para usar en este dispositivo: no se puede exportar. */
export function importarClaveDatos(bruta: Uint8Array<ArrayBuffer>, exportable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bruta, { name: "AES-GCM" }, exportable, ["encrypt", "decrypt"]);
}
