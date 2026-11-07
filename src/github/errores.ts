/** Errores tipados para que la interfaz pueda explicar qué pasa. */

export class ErrorRemoto extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401: token no válido, revocado o caducado. */
export class ErrorCredenciales extends ErrorRemoto {}

/** 403: falta permiso o se alcanzó el límite de peticiones. */
export class ErrorPermiso extends ErrorRemoto {}

/** El fichero cambió en GitHub desde que se leyó (otro dispositivo escribió antes). */
export class ErrorConflicto extends ErrorRemoto {}

/** Sin conexión o fallo de red. */
export class ErrorRed extends ErrorRemoto {}

/** El repositorio de datos es público: se rechaza para no exponer nada. */
export class ErrorRepoPublico extends ErrorRemoto {}
