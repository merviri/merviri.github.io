import { aBase64, desdeBase64, desdeUtf8, utf8 } from "../util/bytes";
import { ErrorConflicto, ErrorCredenciales, ErrorPermiso, ErrorRed, ErrorRemoto } from "./errores";
import type { Arbol, InfoRepo, Remoto } from "./remoto";

/**
 * Cliente mínimo de la API REST de GitHub.
 * - Contenidos: https://docs.github.com/en/rest/repos/contents
 * - Árboles y blobs: https://docs.github.com/en/rest/git
 * GitHub advierte de que las escrituras en paralelo entran en conflicto, así
 * que todas pasan por una cola y se hacen de una en una.
 * Para ver si hay cambios se pide el árbol con If-None-Match: si no ha
 * cambiado, GitHub responde 304 y esa petición no gasta cupo.
 */

const API = "https://api.github.com";
export const VERSION_API = "2026-03-10";

export interface OpcionesCliente {
  propietario: string;
  repositorio: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class ClienteGitHub implements Remoto {
  private readonly fetchImpl: typeof fetch;
  private colaEscritura: Promise<unknown> = Promise.resolve();

  constructor(private readonly op: OpcionesCliente) {
    if (!/^[A-Za-z0-9-]+$/.test(op.propietario)) throw new Error("Organización o usuario de GitHub no válido.");
    if (!/^[A-Za-z0-9._-]+$/.test(op.repositorio)) throw new Error("Nombre de repositorio no válido.");
    if (!op.token.trim()) throw new Error("Falta el token.");
    this.fetchImpl = op.fetchImpl ?? fetch.bind(globalThis);
  }

  private cabeceras(extra: Record<string, string> = {}): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.op.token.trim()}`,
      "X-GitHub-Api-Version": VERSION_API,
      ...extra,
    };
  }

  private url(ruta: string) {
    return `${API}/repos/${this.op.propietario}/${this.op.repositorio}${ruta}`;
  }

  private contenidos(ruta: string) {
    return this.url(`/contents/${ruta.split("/").map(encodeURIComponent).join("/")}`);
  }

  private async pedir(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (e) {
      throw new ErrorRed(`No se pudo contactar con GitHub: ${(e as Error).message}`);
    }
  }

  private async fallo(res: Response, accion: string): Promise<never> {
    let detalle = "";
    try {
      detalle = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      /* cuerpo vacío o no JSON */
    }
    const msg = `${accion}: ${res.status}${detalle ? ` (${detalle})` : ""}`;
    if (res.status === 401) throw new ErrorCredenciales(`${msg}. El token no es válido o ha caducado.`, 401);
    if (res.status === 403 || res.status === 429) {
      throw new ErrorPermiso(`${msg}. Falta permiso o se alcanzó el límite de peticiones.`, res.status);
    }
    if (res.status === 409 || res.status === 422) throw new ErrorConflicto(msg, res.status);
    throw new ErrorRemoto(msg, res.status);
  }

  async info(): Promise<InfoRepo> {
    const res = await this.pedir(this.url(""), { headers: this.cabeceras(), cache: "no-store" });
    if (res.status === 404) {
      throw new ErrorRemoto("No se encuentra el repositorio, o el token no tiene acceso a él.", 404);
    }
    if (!res.ok) await this.fallo(res, "Leer el repositorio");
    const b = (await res.json()) as {
      full_name: string; private: boolean; default_branch?: string; permissions?: { push?: boolean };
    };
    return {
      nombre: b.full_name,
      privado: b.private === true,
      escribir: typeof b.permissions?.push === "boolean" ? b.permissions.push : null,
      rama: b.default_branch || "main",
    };
  }

  async arbol(rama: string, etag: string | null): Promise<Arbol | "sin-cambios"> {
    const res = await this.pedir(this.url(`/git/trees/${encodeURIComponent(rama)}?recursive=1`), {
      headers: this.cabeceras(etag ? { "If-None-Match": etag } : {}),
      cache: "no-store",
    });
    if (res.status === 304) return "sin-cambios";
    // Repositorio vacío: 409 ("Git Repository is empty") o 404 (aún no hay rama).
    if (res.status === 409 || res.status === 404) return { etag: null, ficheros: new Map() };
    if (!res.ok) await this.fallo(res, "Listar ficheros");
    const b = (await res.json()) as { tree?: { path: string; type: string; sha: string }[]; truncated?: boolean };
    const ficheros = new Map<string, string>();
    for (const e of b.tree ?? []) if (e.type === "blob") ficheros.set(e.path, e.sha);
    return { etag: res.headers.get("ETag"), ficheros };
  }

  async blob(sha: string): Promise<Uint8Array<ArrayBuffer>> {
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new ErrorRemoto("Identificador de contenido no válido.");
    // Un blob no cambia nunca: se puede reutilizar lo que tenga el navegador.
    const res = await this.pedir(this.url(`/git/blobs/${sha}`), { headers: this.cabeceras() });
    if (!res.ok) await this.fallo(res, "Leer un fichero");
    const b = (await res.json()) as { content?: string; encoding?: string };
    if (b.encoding !== "base64" || typeof b.content !== "string") throw new ErrorRemoto("Respuesta inesperada al leer un fichero.");
    return desdeBase64(b.content);
  }

  async leer(ruta: string): Promise<{ texto: string; sha: string } | null> {
    const res = await this.pedir(this.contenidos(ruta), { headers: this.cabeceras(), cache: "no-store" });
    if (res.status === 404) return null;
    if (!res.ok) await this.fallo(res, `Leer ${ruta}`);
    const b = (await res.json()) as { type?: string; encoding?: string; content?: string; sha?: string };
    if (b.type !== "file" || typeof b.sha !== "string" || b.encoding !== "base64" || typeof b.content !== "string") {
      throw new ErrorRemoto(`${ruta} no es un fichero que Merviri pueda leer.`);
    }
    return { texto: desdeUtf8(desdeBase64(b.content)), sha: b.sha };
  }

  escribir(ruta: string, texto: string, sha: string | null, mensaje: string): Promise<string> {
    const hacer = async () => {
      const cuerpo: Record<string, unknown> = { message: mensaje, content: aBase64(utf8(texto)) };
      if (sha) cuerpo.sha = sha;
      const res = await this.pedir(this.contenidos(ruta), {
        method: "PUT",
        headers: this.cabeceras({ "Content-Type": "application/json" }),
        body: JSON.stringify(cuerpo),
        cache: "no-store",
      });
      if (!res.ok) await this.fallo(res, `Guardar ${ruta}`);
      const out = (await res.json()) as { content?: { sha?: string } };
      if (typeof out.content?.sha !== "string") throw new ErrorRemoto(`Respuesta inesperada al guardar ${ruta}.`);
      return out.content.sha;
    };
    // Encadenar en la cola; un fallo no bloquea las escrituras siguientes.
    const siguiente = this.colaEscritura.then(hacer, hacer);
    this.colaEscritura = siguiente.catch(() => undefined);
    return siguiente;
  }
}
