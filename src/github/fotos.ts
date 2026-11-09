import { aBase64 } from "../util/bytes";
import { ErrorConflicto, ErrorCredenciales, ErrorPermiso, ErrorRed, ErrorRemoto } from "./errores";
import { VERSION_API } from "./cliente";

/**
 * Repositorios de fotos (merviri/fotos-1 … fotos-5). Cada foto son tres
 * ficheros cifrados (miniatura, vista y original). Para liberar espacio, la
 * papelera se vacía rehaciendo el repositorio sin esas fotos y sin
 * historial (un commit nuevo sin padres): lo borrado deja de existir y
 * GitHub lo limpia en su siguiente mantenimiento.
 */
export interface RepoFotos {
  nombre: string;
  /** Sube un fichero (si ya existe, no hace nada). */
  subir(ruta: string, datos: Uint8Array<ArrayBuffer>): Promise<void>;
  bajar(ruta: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Rutas de todos los ficheros (para comprobar que no falta nada). */
  listar(): Promise<Set<string>>;
  /** Rehace el repositorio sin los ficheros que cumplan `quitar`. Devuelve cuántos se quitaron. */
  vaciar(quitar: (ruta: string) => boolean): Promise<number>;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const API = "https://api.github.com";

export class ClienteFotos implements RepoFotos {
  private cola: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly propietario: string,
    readonly nombre: string,
    private readonly token: string,
    private readonly rama = "main",
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {
    if (!/^[A-Za-z0-9-]+$/.test(propietario) || !/^[A-Za-z0-9._-]+$/.test(nombre)) throw new Error("Repositorio de fotos no válido.");
  }

  private cab(extra: Record<string, string> = {}): HeadersInit {
    return { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token.trim()}`, "X-GitHub-Api-Version": VERSION_API, ...extra };
  }

  private url(r: string) {
    return `${API}/repos/${this.propietario}/${this.nombre}${r}`;
  }

  private async pedir(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { cache: "no-store", ...init });
    } catch (e) {
      throw new ErrorRed(`No se pudo contactar con GitHub: ${(e as Error).message}`);
    }
  }

  private async fallo(res: Response, accion: string): Promise<never> {
    let detalle = "";
    try { detalle = ((await res.json()) as { message?: string }).message ?? ""; } catch { /* sin cuerpo */ }
    const msg = `${accion}: ${res.status}${detalle ? ` (${detalle})` : ""}`;
    if (res.status === 401) throw new ErrorCredenciales(`${msg}. El token no es válido o ha caducado.`, 401);
    if (res.status === 403 || res.status === 429) throw new ErrorPermiso(`${msg}. ¿Está ${this.nombre} en el token?`, res.status);
    if (res.status === 409 || res.status === 422) throw new ErrorConflicto(msg, res.status);
    throw new ErrorRemoto(msg, res.status);
  }

  private contenidos(ruta: string) {
    return this.url(`/contents/${ruta.split("/").map(encodeURIComponent).join("/")}`);
  }

  subir(ruta: string, datos: Uint8Array<ArrayBuffer>): Promise<void> {
    const cuerpo = JSON.stringify({ message: "Merviri: foto", content: aBase64(datos) });
    const hacer = async () => {
      for (let intento = 0; ; intento++) {
        const res = await this.pedir(this.contenidos(ruta), {
          method: "PUT",
          headers: this.cab({ "Content-Type": "application/json" }),
          // Sin «branch»: en un repositorio vacío, GitHub crea la rama principal con la primera foto.
          body: cuerpo,
        });
        if (res.ok) return;
        if (res.status === 422) {
          // «Falta el sha»: el fichero ya existe (subida repetida). Otro 422 es un error de verdad.
          const msg = await res.clone().json().then((j: { message?: string }) => j.message ?? "", () => "");
          if (/sha/i.test(msg)) return;
        }
        // Si la otra está subiendo a la vez, GitHub rechaza uno de los dos (409): se reintenta.
        if ((res.status === 409 || res.status >= 500) && intento < 4) {
          await esperar(800 * (intento + 1) + Math.random() * 700);
          continue;
        }
        await this.fallo(res, "Subir una foto");
      }
    };
    const sig = this.cola.then(hacer, hacer);
    this.cola = sig.catch(() => undefined);
    return sig;
  }

  async bajar(ruta: string): Promise<Uint8Array<ArrayBuffer>> {
    const res = await this.pedir(this.contenidos(ruta), { headers: this.cab({ Accept: "application/vnd.github.raw+json" }), cache: "default" });
    if (!res.ok) await this.fallo(res, "Bajar una foto");
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Commit al que apunta la rama (null si el repositorio está vacío). */
  private async cabeza(): Promise<string | null> {
    const ref = await this.pedir(this.url(`/git/ref/heads/${this.rama}`), { headers: this.cab() });
    if (ref.status === 404 || ref.status === 409) return null; // repositorio vacío
    if (!ref.ok) await this.fallo(ref, "Leer el repositorio de fotos");
    return ((await ref.json()) as { object: { sha: string } }).object.sha;
  }

  private async arbol(commit: string) {
    const arbolRes = await this.pedir(this.url(`/git/trees/${commit}?recursive=1`), { headers: this.cab() });
    if (!arbolRes.ok) await this.fallo(arbolRes, "Listar las fotos");
    const arbol = (await arbolRes.json()) as { tree: { path: string; type: string; sha: string; mode: string }[]; truncated?: boolean };
    if (arbol.truncated) throw new ErrorRemoto("El repositorio de fotos es demasiado grande para leerlo de una vez.");
    return arbol.tree.filter((e) => e.type === "blob");
  }

  async listar(): Promise<Set<string>> {
    const commit = await this.cabeza();
    return new Set(commit ? (await this.arbol(commit)).map((e) => e.path) : []);
  }

  async vaciar(quitar: (ruta: string) => boolean): Promise<number> {
    // Si mientras se prepara alguien sube una foto, se vuelve a empezar: así
    // no se pierde lo que se suba justo mientras se vacía la papelera.
    for (let intento = 0; ; intento++) {
      const hecho = await this.vaciarUnaVez(quitar);
      if (hecho !== "movido") return hecho;
      if (intento >= 5) throw new ErrorRemoto("Se están subiendo fotos ahora mismo: vaciad la papelera cuando terminen.");
      await esperar(3000);
    }
  }

  private async vaciarUnaVez(quitar: (ruta: string) => boolean): Promise<number | "movido"> {
    const commit = await this.cabeza();
    if (!commit) return 0;
    const blobs = await this.arbol(commit);
    const quedan = blobs.filter((e) => !quitar(e.path));
    const quitados = blobs.length - quedan.length;
    if (!quitados) return 0;
    if (!quedan.length) {
      // GitHub no admite un árbol vacío: se deja una nota en el repositorio.
      const nota = await this.pedir(this.url("/git/blobs"), {
        method: "POST", headers: this.cab({ "Content-Type": "application/json" }),
        body: JSON.stringify({ content: "Fotos cifradas de Merviri.\n", encoding: "utf-8" }),
      });
      if (!nota.ok) await this.fallo(nota, "Vaciar la papelera");
      quedan.push({ path: "LEEME.md", type: "blob", mode: "100644", sha: ((await nota.json()) as { sha: string }).sha });
    }
    const nuevoArbol = await this.pedir(this.url("/git/trees"), {
      method: "POST", headers: this.cab({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tree: quedan.map((e) => ({ path: e.path, mode: e.mode || "100644", type: "blob", sha: e.sha })) }),
    });
    if (!nuevoArbol.ok) await this.fallo(nuevoArbol, "Preparar el álbum");
    const tree = ((await nuevoArbol.json()) as { sha: string }).sha;
    const nuevo = await this.pedir(this.url("/git/commits"), {
      method: "POST", headers: this.cab({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Merviri: papelera vaciada", tree, parents: [] }),
    });
    if (!nuevo.ok) await this.fallo(nuevo, "Vaciar la papelera");
    const sha = ((await nuevo.json()) as { sha: string }).sha;
    // Justo antes de mover la rama: si ha cambiado, alguien acaba de subir algo.
    if ((await this.cabeza()) !== commit) return "movido";
    const mover = await this.pedir(this.url(`/git/refs/heads/${this.rama}`), {
      method: "PATCH", headers: this.cab({ "Content-Type": "application/json" }), body: JSON.stringify({ sha, force: true }),
    });
    if (!mover.ok) await this.fallo(mover, "Vaciar la papelera");
    return quitados;
  }
}

/** En memoria: para las pruebas y el modo de desarrollo. */
export class FotosMemoria implements RepoFotos {
  ficheros = new Map<string, Uint8Array<ArrayBuffer>>();
  subidas = 0;
  constructor(readonly nombre: string) {}
  async subir(ruta: string, datos: Uint8Array<ArrayBuffer>) {
    if (!this.ficheros.has(ruta)) { this.ficheros.set(ruta, datos); this.subidas++; }
  }
  async bajar(ruta: string) {
    const d = this.ficheros.get(ruta);
    if (!d) throw new ErrorRemoto(`No existe ${ruta}`, 404);
    return d;
  }
  async listar() {
    return new Set(this.ficheros.keys());
  }
  async vaciar(quitar: (ruta: string) => boolean) {
    let n = 0;
    for (const r of [...this.ficheros.keys()]) if (quitar(r)) { this.ficheros.delete(r); n++; }
    return n;
  }
}
