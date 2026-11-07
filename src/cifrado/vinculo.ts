import { aBase64Url, aleatorios, desdeBase64Url, desdeUtf8, unir, utf8 } from "../util/bytes";
import { cifrar, descifrar } from "./aes";
import { ErrorDescifrado } from "./errores";
import { derivarClave, ITERACIONES_CONTRASENA } from "./kdf";

/**
 * Código de vinculación (va dentro del QR y del enlace «#vincular=…»).
 * Lleva la organización, el repositorio, el token y su caducidad, cifrados
 * con la contraseña común: sin la contraseña no sirve de nada.
 * Formato binario compacto para que el QR sea pequeño:
 *   1 byte versión | 4 bytes iteraciones | 16 bytes sal | 12 bytes IV | cifrado
 */
export interface DatosVinculo {
  propietario: string;
  repositorio: string;
  token: string;
  caduca: string | null;
}

const VERSION = 1;
const AAD = utf8("merviri-vinculo:1");

export async function crearVinculo(d: DatosVinculo, contrasena: string, iteraciones = ITERACIONES_CONTRASENA): Promise<string> {
  const sal = aleatorios(16);
  const clave = await derivarClave(contrasena, sal, iteraciones);
  const claro = utf8(JSON.stringify({ o: d.propietario, r: d.repositorio, t: d.token, c: d.caduca }));
  const { iv, ct } = await cifrar(clave, claro, AAD);
  const cab = new Uint8Array(5);
  cab[0] = VERSION;
  new DataView(cab.buffer).setUint32(1, iteraciones);
  return aBase64Url(unir(cab, sal, iv, ct));
}

export class ErrorVinculo extends Error {}

export async function abrirVinculo(codigo: string, contrasena: string): Promise<DatosVinculo> {
  let b: Uint8Array<ArrayBuffer>;
  try {
    b = desdeBase64Url(codigo.trim());
  } catch {
    throw new ErrorVinculo("El código de vinculación no es válido.");
  }
  if (b.length < 5 + 16 + 12 + 17 || b[0] !== VERSION) throw new ErrorVinculo("El código de vinculación no es válido.");
  const iteraciones = new DataView(b.buffer, b.byteOffset).getUint32(1);
  if (iteraciones < 1000 || iteraciones > 10_000_000) throw new ErrorVinculo("El código de vinculación no es válido.");
  const sal = b.slice(5, 21);
  const iv = b.slice(21, 33);
  const ct = b.slice(33);
  const claro = await descifrar(await derivarClave(contrasena, sal, iteraciones), iv, ct, AAD);
  const j = JSON.parse(desdeUtf8(claro)) as { o?: unknown; r?: unknown; t?: unknown; c?: unknown };
  if (typeof j.o !== "string" || typeof j.r !== "string" || typeof j.t !== "string") {
    throw new ErrorDescifrado("El código de vinculación está incompleto.");
  }
  return { propietario: j.o, repositorio: j.r, token: j.t, caduca: typeof j.c === "string" ? j.c : null };
}

export const enlaceVinculo = (origen: string, codigo: string) => `${origen}/#vincular=${codigo}`;

/** Extrae el código de un «#vincular=…» (o null). */
export function codigoDeHash(hash: string): string | null {
  const m = /^#vincular=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1]! : null;
}
