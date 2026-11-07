import { aleatorios, desdeBase64Url, unir, utf8 } from "../util/bytes";

/**
 * Cifrado de un aviso para un dispositivo concreto (Web Push, RFC 8291 con
 * la codificación aes128gcm de RFC 8188). Lo hace el móvil que manda el
 * aviso: GitHub (que solo lo reenvía) y el servicio de avisos de Google
 * (que lo entrega) ven bytes ilegibles. Solo el móvil de destino tiene la
 * clave privada para abrirlo.
 */

export interface ClavesSuscripcion {
  /** Clave pública P-256 del dispositivo (65 bytes, Base64 URL). */
  p256dh: string;
  /** Secreto de autenticación (16 bytes, Base64 URL). */
  auth: string;
}

const TAM_REGISTRO = 4096;
/** Margen para que el aviso quepa en un registro (y por debajo del límite de los servicios). */
export const MAX_AVISO = 3000;

async function hkdf(sal: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const clave = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, clave, bytes * 8));
}

export interface OpcionesCifrado {
  /** Solo para pruebas: sal y par efímero fijos. */
  sal?: Uint8Array<ArrayBuffer>;
  efimera?: CryptoKeyPair;
}

export async function cifrarAviso(destino: ClavesSuscripcion, claro: Uint8Array<ArrayBuffer>, op: OpcionesCifrado = {}): Promise<Uint8Array<ArrayBuffer>> {
  if (claro.length > MAX_AVISO) throw new Error("El aviso es demasiado largo.");
  const uaPublica = desdeBase64Url(destino.p256dh);
  const auth = desdeBase64Url(destino.auth);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4) throw new Error("La clave del dispositivo no es válida.");
  if (auth.length !== 16) throw new Error("El secreto del dispositivo no es válido.");

  const claveUa = await crypto.subtle.importKey("raw", uaPublica, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const efimera = op.efimera ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", efimera.publicKey));
  const secretoEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: claveUa }, efimera.privateKey, 256));

  // RFC 8291 §3.4: IKM = HKDF(auth, ecdh, "WebPush: info\0" || ua_public || as_public, 32)
  const infoClave = unir(utf8("WebPush: info\0"), uaPublica, asPublica);
  const ikm = await hkdf(auth, secretoEcdh, infoClave, 32);

  // RFC 8188 §2.2: CEK y nonce a partir de una sal aleatoria.
  const sal = op.sal ?? aleatorios(16);
  const cek = await hkdf(sal, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // Un único registro: texto + delimitador 0x02 (último registro).
  const registro = unir(claro, new Uint8Array([2]));
  const claveCek = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, claveCek, registro));

  // Cabecera: sal (16) | tamaño de registro (4) | longitud del id (1) | id = as_public (65)
  const cabecera = new Uint8Array(16 + 4 + 1);
  cabecera.set(sal, 0);
  new DataView(cabecera.buffer).setUint32(16, TAM_REGISTRO);
  cabecera[20] = asPublica.length;
  return unir(cabecera, asPublica, cifrado);
}

/** Contenido del aviso (lo que lee el service worker). Claves cortas para que ocupe poco. */
export interface Aviso {
  /** Título. */
  t: string;
  /** Texto. */
  b: string;
  /** Ruta de la app a la que lleva («dibujo/abc»). */
  r: string;
  /** Etiqueta: los avisos con la misma se sustituyen en vez de amontonarse. */
  e: string;
  /** Sin sonido ni vibración (horas de silencio). */
  s?: 1;
}

export function avisoEnBytes(a: Aviso): Uint8Array<ArrayBuffer> {
  const recortar = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  return utf8(JSON.stringify({ ...a, t: recortar(a.t, 120), b: recortar(a.b, 300) }));
}
