/**
 * Lo que Merviri necesita de un repositorio. Hay dos implementaciones: la de
 * GitHub (cliente.ts) y una en memoria para pruebas y desarrollo (memoria.ts).
 */
export interface InfoRepo {
  nombre: string;
  privado: boolean;
  /** Puede faltar según el tipo de token; null = desconocido. */
  escribir: boolean | null;
  rama: string;
}

/** Ficheros del repositorio: ruta → sha del contenido (blob). */
export interface Arbol {
  etag: string | null;
  ficheros: Map<string, string>;
}

export interface Remoto {
  info(): Promise<InfoRepo>;
  /** Lista de ficheros; "sin-cambios" si coincide con el etag dado. Repositorio vacío → lista vacía. */
  arbol(rama: string, etag: string | null): Promise<Arbol | "sin-cambios">;
  /** Contenido de un fichero por su sha. */
  blob(sha: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Lee un fichero de texto (null si no existe). */
  leer(ruta: string): Promise<{ texto: string; sha: string } | null>;
  /** Crea (sha = null) o reemplaza un fichero. Devuelve el sha nuevo. Si cambió antes → ErrorConflicto. */
  escribir(ruta: string, texto: string, sha: string | null, mensaje: string): Promise<string>;
}

export interface Conexion {
  propietario: string;
  repositorio: string;
  token: string;
  /** Fecha de caducidad del token (la que se elige al crearlo en GitHub). */
  caduca: string | null;
}
