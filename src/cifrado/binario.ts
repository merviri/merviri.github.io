import { unir, utf8 } from "../util/bytes";
import { cifrar, descifrar } from "./aes";
import { ErrorDescifrado } from "./errores";
import type { ClaveDatos } from "./sobre";

/**
 * Ficheros binarios cifrados (fotos):
 *   «MRV1» | id de la clave (12 caracteres) | IV (12 bytes) | cifrado
 * La ruta va como dato asociado, igual que en los sobres.
 */
const MAGIA = utf8("MRV1");
const aad = (ruta: string) => utf8(`merviri-foto:${ruta}`);

export async function cerrarBinario(k: ClaveDatos, ruta: string, datos: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const id = utf8(k.idClave.padEnd(12, " ").slice(0, 12));
  const { iv, ct } = await cifrar(k.clave, datos, aad(ruta));
  return unir(MAGIA, id, iv, ct);
}

export async function abrirBinario(k: ClaveDatos, ruta: string, datos: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  if (datos.length < 4 + 12 + 12 + 16 || MAGIA.some((b, i) => datos[i] !== b)) throw new ErrorDescifrado("No es una foto de Merviri.");
  const id = new TextDecoder().decode(datos.slice(4, 16)).trim();
  if (id !== k.idClave) throw new ErrorDescifrado("La foto está cifrada con otra clave.");
  return descifrar(k.clave, datos.slice(16, 28), datos.slice(28), aad(ruta));
}
