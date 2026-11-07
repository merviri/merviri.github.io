import { ErrorDescifrado } from "../../cifrado/errores";
import { ErrorVinculo } from "../../cifrado/vinculo";
import { ErrorCredenciales, ErrorPermiso, ErrorRed } from "../../github/errores";

/** Traduce un error a una frase que se entienda. */
export function mensajeError(e: unknown, contexto: "contrasena" | "general" = "general"): string {
  if (e instanceof ErrorDescifrado) {
    return contexto === "contrasena" ? "La contraseña no es correcta." : `No se ha podido descifrar: ${e.message}`;
  }
  if (e instanceof ErrorVinculo) return e.message;
  if (e instanceof ErrorCredenciales) return "GitHub no acepta el token: revisa que esté bien copiado y que no haya caducado.";
  if (e instanceof ErrorPermiso) return "GitHub no deja hacerlo: revisa los permisos del token (Contents: lectura y escritura).";
  if (e instanceof ErrorRed) return "No hay conexión con GitHub. Prueba de nuevo cuando tengas internet.";
  return e instanceof Error ? e.message : String(e);
}
