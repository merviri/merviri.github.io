import { aBase64, aleatorios, desdeBase64, utf8 } from "../util/bytes";

/**
 * Derivación de claves a partir de una contraseña (PBKDF2-SHA256, WebCrypto).
 * 600.000 iteraciones es la recomendación actual de OWASP para PBKDF2-SHA256:
 * tarda alrededor de un segundo en un móvil, una vez al vincular.
 */
export const ITERACIONES_CONTRASENA = 600_000;
/** El código de recuperación es aleatorio (160 bits): no necesita tantas. */
export const ITERACIONES_CODIGO = 100_000;

export interface ParamsKdf {
  nombre: "PBKDF2-SHA256";
  iteraciones: number;
  sal: string;
}

export function nuevosParams(iteraciones: number): ParamsKdf {
  return { nombre: "PBKDF2-SHA256", iteraciones, sal: aBase64(aleatorios(16)) };
}

export function validarParams(p: unknown): p is ParamsKdf {
  const x = p as ParamsKdf;
  return !!x && x.nombre === "PBKDF2-SHA256" && Number.isInteger(x.iteraciones) && x.iteraciones >= 1000 &&
    x.iteraciones <= 10_000_000 && typeof x.sal === "string";
}

export async function derivarClave(secreto: string, sal: Uint8Array<ArrayBuffer>, iteraciones: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", utf8(secreto.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteraciones },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export const derivarDesdeParams = (secreto: string, p: ParamsKdf) => derivarClave(secreto, desdeBase64(p.sal), p.iteraciones);
