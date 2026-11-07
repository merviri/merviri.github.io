import { aBase64, aleatorios, aHex, desdeBase64, utf8 } from "../util/bytes";
import { cifrar, descifrar, importarClaveDatos } from "./aes";
import { generarCodigo, normalizarCodigo } from "./codigo";
import { ErrorDescifrado } from "./errores";
import {
  derivarDesdeParams,
  ITERACIONES_CODIGO,
  ITERACIONES_CONTRASENA,
  nuevosParams,
  validarParams,
  type ParamsKdf,
} from "./kdf";

/**
 * El llavero (`llavero.json`, en claro en el repositorio de datos) guarda la
 * clave de datos de Merviri envuelta dos veces:
 *  - con la contraseña común (la que se escribe al vincular un dispositivo);
 *  - con el código de recuperación (por si se olvida la contraseña).
 * La clave de datos es aleatoria y no cambia al cambiar la contraseña: solo
 * se vuelve a envolver. Sin contraseña ni código, el llavero no sirve.
 * La pista va en claro: la vería cualquiera con acceso al repositorio.
 */

export interface CajaClave {
  kdf: ParamsKdf;
  iv: string;
  cifrado: string;
}

export interface Llavero {
  formato: "merviri-llavero";
  version: 1;
  idClave: string;
  pista: string | null;
  contrasena: CajaClave;
  recuperacion: CajaClave;
  creado: string;
  actualizado: string;
}

export interface OpcionesLlavero {
  iteraciones?: number;
  iteracionesCodigo?: number;
  ahora?: string;
}

export interface ClaveAbierta {
  /** Clave para cifrar y descifrar en este dispositivo (no exportable). */
  clave: CryptoKey;
  /** Bytes de la clave: solo para volver a envolverla; no se guardan. */
  bruta: Uint8Array<ArrayBuffer>;
  idClave: string;
}

const aad = (idClave: string, tipo: "contrasena" | "recuperacion") => utf8(`merviri-llavero:${idClave}:${tipo}`);

async function envolver(
  bruta: Uint8Array<ArrayBuffer>, secreto: string, iteraciones: number, ad: Uint8Array<ArrayBuffer>,
): Promise<CajaClave> {
  const kdf = nuevosParams(iteraciones);
  const { iv, ct } = await cifrar(await derivarDesdeParams(secreto, kdf), bruta, ad);
  return { kdf, iv: aBase64(iv), cifrado: aBase64(ct) };
}

async function desenvolver(caja: CajaClave, secreto: string, ad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await derivarDesdeParams(secreto, caja.kdf);
  const bruta = await descifrar(kek, desdeBase64(caja.iv), desdeBase64(caja.cifrado), ad);
  if (bruta.length !== 32) throw new ErrorDescifrado("La clave guardada no tiene el tamaño esperado.");
  return bruta;
}

const limpiarPista = (p: string | null | undefined) => (p && p.trim() ? p.trim().slice(0, 200) : null);

export async function crearLlavero(contrasena: string, pista: string | null, op: OpcionesLlavero = {}) {
  const ahora = op.ahora ?? new Date().toISOString();
  const bruta = aleatorios(32);
  const idClave = aHex(aleatorios(6));
  const codigo = generarCodigo();
  const llavero: Llavero = {
    formato: "merviri-llavero",
    version: 1,
    idClave,
    pista: limpiarPista(pista),
    contrasena: await envolver(bruta, contrasena, op.iteraciones ?? ITERACIONES_CONTRASENA, aad(idClave, "contrasena")),
    recuperacion: await envolver(
      bruta, normalizarCodigo(codigo)!, op.iteracionesCodigo ?? ITERACIONES_CODIGO, aad(idClave, "recuperacion"),
    ),
    creado: ahora,
    actualizado: ahora,
  };
  const abierta: ClaveAbierta = { clave: await importarClaveDatos(bruta), bruta, idClave };
  return { llavero, codigo, abierta };
}

export async function abrirConContrasena(llavero: Llavero, contrasena: string): Promise<ClaveAbierta> {
  const bruta = await desenvolver(llavero.contrasena, contrasena, aad(llavero.idClave, "contrasena"));
  return { clave: await importarClaveDatos(bruta), bruta, idClave: llavero.idClave };
}

export async function abrirConCodigo(llavero: Llavero, codigo: string): Promise<ClaveAbierta> {
  const normal = normalizarCodigo(codigo);
  if (!normal) throw new ErrorDescifrado("El código de recuperación no tiene el formato correcto.");
  const bruta = await desenvolver(llavero.recuperacion, normal, aad(llavero.idClave, "recuperacion"));
  return { clave: await importarClaveDatos(bruta), bruta, idClave: llavero.idClave };
}

/** Comprueba la contraseña sin quedarse con la clave. */
export async function contrasenaCorrecta(llavero: Llavero, contrasena: string): Promise<boolean> {
  try {
    await abrirConContrasena(llavero, contrasena);
    return true;
  } catch (e) {
    if (e instanceof ErrorDescifrado) return false;
    throw e;
  }
}

export async function cambiarContrasena(
  llavero: Llavero, abierta: ClaveAbierta, nueva: string, pista: string | null, op: OpcionesLlavero = {},
): Promise<Llavero> {
  return {
    ...llavero,
    pista: limpiarPista(pista),
    contrasena: await envolver(abierta.bruta, nueva, op.iteraciones ?? ITERACIONES_CONTRASENA, aad(llavero.idClave, "contrasena")),
    actualizado: op.ahora ?? new Date().toISOString(),
  };
}

export async function nuevoCodigoRecuperacion(llavero: Llavero, abierta: ClaveAbierta, op: OpcionesLlavero = {}) {
  const codigo = generarCodigo();
  const nuevo: Llavero = {
    ...llavero,
    recuperacion: await envolver(
      abierta.bruta, normalizarCodigo(codigo)!, op.iteracionesCodigo ?? ITERACIONES_CODIGO, aad(llavero.idClave, "recuperacion"),
    ),
    actualizado: op.ahora ?? new Date().toISOString(),
  };
  return { llavero: nuevo, codigo };
}

function validarCaja(c: unknown): c is CajaClave {
  const x = c as CajaClave;
  return !!x && validarParams(x.kdf) && typeof x.iv === "string" && typeof x.cifrado === "string";
}

export function validarLlavero(x: unknown): x is Llavero {
  const l = x as Llavero;
  return !!l && l.formato === "merviri-llavero" && l.version === 1 && typeof l.idClave === "string" &&
    (l.pista === null || typeof l.pista === "string") && validarCaja(l.contrasena) && validarCaja(l.recuperacion);
}

/** Requisitos mínimos de la contraseña común. Devuelve el problema o null. */
export function problemaContrasena(c: string, pista: string | null): string | null {
  if (c.length < 10) return "Tiene que tener al menos 10 caracteres.";
  if (/^(.)\1+$/.test(c)) return "No puede ser el mismo carácter repetido.";
  const p = pista?.trim().toLowerCase() ?? "";
  if (p && p.includes(c.toLowerCase())) return "La pista no puede contener la contraseña.";
  if (p.length >= 4 && c.toLowerCase().includes(p)) return "La contraseña no puede contener la pista.";
  return null;
}
