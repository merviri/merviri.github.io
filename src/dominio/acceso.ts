import { sha256Hex } from "../util/bytes";
import { diasEntre, esFecha, type Fecha } from "./fechas";

/**
 * Acceso a GitHub: el token que usan todos los dispositivos.
 * Para renovarlo sin repetir el QR, quien tiene el token nuevo lo deja en
 * `datos/acceso.json` (cifrado) y los demás dispositivos lo recogen al
 * sincronizar, mientras el antiguo aún funciona.
 */
export const RUTA_ACCESO = "datos/acceso.json";
export const ID_ACCESO = "token";

export interface Acceso {
  id: typeof ID_ACCESO;
  token: string;
  caduca: Fecha | null;
  huella: string;
}

/** Huella del token: identifica cuál usa cada dispositivo sin mostrarlo. */
export async function huellaToken(token: string): Promise<string> {
  return (await sha256Hex(`merviri-token:${token.trim()}`)).slice(0, 12);
}

export type EstadoToken =
  | { tipo: "sin-fecha" }
  | { tipo: "vigente"; quedan: number }
  | { tipo: "caduca-pronto"; quedan: number }
  | { tipo: "caducado" };

/** Avisa con 14 días de antelación. */
export function estadoToken(caduca: Fecha | null, hoyF: Fecha, aviso = 14): EstadoToken {
  if (!caduca || !esFecha(caduca)) return { tipo: "sin-fecha" };
  const quedan = diasEntre(hoyF, caduca);
  if (quedan < 0) return { tipo: "caducado" };
  if (quedan <= aviso) return { tipo: "caduca-pronto", quedan };
  return { tipo: "vigente", quedan };
}

/** Los tokens de grano fino empiezan por github_pat_; los clásicos, por ghp_. */
export function problemaToken(token: string): string | null {
  const t = token.trim();
  if (!t) return "Falta el token.";
  if (/\s/.test(t)) return "El token no puede tener espacios.";
  if (t.startsWith("ghp_")) return "Ese es un token clásico: crea uno «de grano fino» (empieza por github_pat_).";
  // «falso…» solo existe en desarrollo (repositorio de mentira; ver src/dev/falso.ts).
  const falso = import.meta.env.DEV && t.startsWith("falso");
  if (!t.startsWith("github_pat_") && !falso) return "El token de grano fino empieza por github_pat_.";
  return null;
}
