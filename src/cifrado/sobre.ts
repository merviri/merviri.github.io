import { aBase64, desdeBase64, desdeUtf8, utf8 } from "../util/bytes";
import { cifrar, descifrar } from "./aes";
import { ErrorDescifrado } from "./errores";

/**
 * Sobre cifrado: así se guarda cada fichero de datos en GitHub.
 *   { formato, v, clave (id), iv, datos }   → todo lo demás es ilegible.
 * La ruta del fichero va como dato asociado: si alguien moviera el contenido
 * de un fichero a otro, no se abriría.
 */
export interface Sobre {
  formato: "merviri-sobre";
  v: 1;
  clave: string;
  iv: string;
  datos: string;
}

export interface ClaveDatos {
  clave: CryptoKey;
  idClave: string;
}

const aadRuta = (ruta: string) => utf8(`merviri:${ruta}`);

export async function cerrarSobre(k: ClaveDatos, ruta: string, valor: unknown): Promise<string> {
  const { iv, ct } = await cifrar(k.clave, utf8(JSON.stringify(valor)), aadRuta(ruta));
  const sobre: Sobre = { formato: "merviri-sobre", v: 1, clave: k.idClave, iv: aBase64(iv), datos: aBase64(ct) };
  return JSON.stringify(sobre) + "\n";
}

export async function abrirSobre(k: ClaveDatos, ruta: string, texto: string): Promise<unknown> {
  let s: Sobre;
  try {
    s = JSON.parse(texto) as Sobre;
  } catch {
    throw new ErrorDescifrado(`${ruta} no es un sobre de Merviri.`);
  }
  if (s?.formato !== "merviri-sobre" || s.v !== 1 || typeof s.iv !== "string" || typeof s.datos !== "string") {
    throw new ErrorDescifrado(`${ruta} no es un sobre de Merviri.`);
  }
  if (s.clave !== k.idClave) throw new ErrorDescifrado(`${ruta} está cifrado con otra clave.`);
  const claro = await descifrar(k.clave, desdeBase64(s.iv), desdeBase64(s.datos), aadRuta(ruta));
  return JSON.parse(desdeUtf8(claro)) as unknown;
}
