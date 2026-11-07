import { ErrorDescifrado } from "../cifrado/errores";
import { abrirSobre, cerrarSobre, type ClaveDatos } from "../cifrado/sobre";
import { ErrorConflicto, ErrorCredenciales, ErrorPermiso, ErrorRed, ErrorRemoto } from "../github/errores";
import type { Remoto } from "../github/remoto";
import type { AlmacenCifrado } from "../local/cifrado";
import { desdeUtf8, nuevoId } from "../util/bytes";

/**
 * Motor de sincronización «primero en local».
 *
 * - Los datos se agrupan en colecciones; cada colección es un fichero cifrado
 *   `datos/<nombre>.json` con registros { id, actualizado, por, … }.
 * - Cada cambio se aplica al momento en el dispositivo (se ve enseguida) y
 *   queda en una cola; después se envía a GitHub, ahora o cuando haya red.
 * - Al enviar, se aplica sobre la última versión que hay en GitHub. Si otro
 *   dispositivo escribió antes (conflicto), se vuelve a leer y se repite:
 *   los cambios de las dos se suman registro a registro, sin pisarse.
 * - Si las dos cambian el MISMO registro, gana el cambio más reciente.
 * - Borrar deja una marca (borrado: true) para que el borrado también viaje.
 * - Para saber si hay novedades se pide la lista de ficheros con su etag:
 *   si nada cambió, GitHub contesta 304 y no se descarga nada.
 */

export interface Meta {
  id: string;
  actualizado: string;
  por: string;
  borrado?: true;
}
export type Registro<T extends object = Record<string, unknown>> = T & Meta;

export interface FicheroDatos {
  esquema: 1;
  registros: Record<string, Registro>;
}

interface EntradaCache {
  sha: string;
  registros: Record<string, Registro>;
}

interface Operacion {
  idOp: string;
  ruta: string;
  registro: Registro;
}

interface Indice {
  etag: string | null;
  rama: string;
  rutas: string[];
  /** sha de los ficheros fuera de datos/ (por ejemplo, llavero.json). */
  raiz: Record<string, string>;
}

export type EstadoSync =
  | { tipo: "inicial" }
  | { tipo: "sincronizando" }
  | { tipo: "sincronizado"; cuando: string }
  | { tipo: "pendiente"; cambios: number; motivo: "sin-red" | "error"; mensaje?: string }
  | { tipo: "credenciales"; mensaje: string };

export const PREFIJO = "datos/";
const MENSAJE = "Merviri";
const MAX_REINTENTOS = 5;

/** Une dos versiones de un registro: gana la más reciente (y, a igualdad, una fija). */
export function fusionar(a: Registro | undefined, b: Registro): Registro {
  if (!a) return b;
  if (b.actualizado > a.actualizado) return b;
  if (b.actualizado < a.actualizado) return a;
  return JSON.stringify(b) >= JSON.stringify(a) ? b : a;
}

function esRegistro(r: unknown, id: string): r is Registro {
  const x = r as Registro;
  return !!x && typeof x === "object" && x.id === id && typeof x.actualizado === "string" && typeof x.por === "string";
}

function leerFichero(valor: unknown, ruta: string): Record<string, Registro> {
  const f = valor as FicheroDatos;
  if (!f || f.esquema !== 1 || typeof f.registros !== "object" || f.registros === null) {
    throw new ErrorDescifrado(`${ruta} no tiene el formato esperado.`);
  }
  const out: Record<string, Registro> = {};
  for (const [id, r] of Object.entries(f.registros)) if (esRegistro(r, id)) out[id] = r;
  return out;
}

/** Un instante un milisegundo posterior (para que un cambio propio supere a su versión anterior). */
const despues = (iso: string) => new Date(new Date(iso).getTime() + 1).toISOString();

/** Las marcas de borrado se guardan 90 días; después se quitan del fichero al reescribirlo. */
export const VIDA_BORRADOS_MS = 90 * 86_400_000;

export function purgarBorrados(registros: Record<string, Registro>, ahora: string): Record<string, Registro> {
  const limite = new Date(ahora).getTime() - VIDA_BORRADOS_MS;
  const out: Record<string, Registro> = {};
  for (const [id, r] of Object.entries(registros)) {
    if (r.borrado && new Date(r.actualizado).getTime() < limite) continue;
    out[id] = r;
  }
  return out;
}

export class Motor {
  private cache = new Map<string, EntradaCache>();
  private cola: Operacion[] = [];
  private indice: Indice = { etag: null, rama: "main", rutas: [], raiz: {} };
  private oyentes = new Set<(rutas: Set<string>) => void>();
  private enCurso: Promise<void> | null = null;
  private otraVez = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private persistiendoCola: Promise<void> = Promise.resolve();
  estado: EstadoSync = { tipo: "inicial" };

  constructor(
    private readonly almacen: AlmacenCifrado,
    private readonly clave: ClaveDatos,
    private remoto: Remoto | null,
    private readonly reloj: () => string = () => new Date().toISOString(),
    private readonly esperaEnvio = 600,
  ) {}

  /** Carga lo guardado en el dispositivo (funciona sin conexión). */
  async iniciar(): Promise<void> {
    this.indice = (await this.almacen.get<Indice>("motor:indice")) ?? this.indice;
    this.cola = (await this.almacen.get<Operacion[]>("motor:cola")) ?? [];
    for (const ruta of this.indice.rutas) {
      const e = await this.almacen.get<EntradaCache>(`motor:f:${ruta}`);
      if (e) this.cache.set(ruta, e);
    }
  }

  setRemoto(remoto: Remoto | null, rama?: string) {
    this.remoto = remoto;
    if (rama) this.indice.rama = rama;
  }

  alCambiar(fn: (rutas: Set<string>) => void): () => void {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  private emitir(rutas: Iterable<string>) {
    const s = new Set(rutas);
    if (s.size) for (const fn of this.oyentes) fn(s);
  }

  // -------------------------------------------------------------------------
  // Lectura: lo que hay en GitHub más los cambios aún por enviar.
  // -------------------------------------------------------------------------

  private visibles(ruta: string): Record<string, Registro> {
    const out = { ...(this.cache.get(ruta)?.registros ?? {}) };
    for (const op of this.cola) if (op.ruta === ruta) out[op.registro.id] = fusionar(out[op.registro.id], op.registro);
    return out;
  }

  lista<T extends object>(ruta: string): Registro<T>[] {
    return Object.values(this.visibles(ruta)).filter((r) => !r.borrado) as Registro<T>[];
  }

  uno<T extends object>(ruta: string, id: string): Registro<T> | undefined {
    const r = this.visibles(ruta)[id];
    return r && !r.borrado ? (r as Registro<T>) : undefined;
  }

  pendientes(): number {
    return this.cola.length;
  }

  get rama(): string {
    return this.indice.rama;
  }

  /** Ficheros de datos que empiezan por `prefijo` (los que hay y los que se van a crear). */
  rutasCon(prefijo: string): string[] {
    const s = new Set([...this.cache.keys()].filter((r) => r.startsWith(prefijo)));
    for (const op of this.cola) if (op.ruta.startsWith(prefijo)) s.add(op.ruta);
    return [...s].sort();
  }

  /** sha actual de un fichero fuera de datos/ (para saber si cambió). */
  shaRaiz(ruta: string): string | undefined {
    return this.indice.raiz[ruta];
  }

  // -------------------------------------------------------------------------
  // Escritura
  // -------------------------------------------------------------------------

  async guardar<T extends object>(ruta: string, datos: T & { id: string }, por: string): Promise<Registro<T>> {
    if (!ruta.startsWith(PREFIJO) || !ruta.endsWith(".json")) throw new Error(`Ruta de datos no válida: ${ruta}`);
    const previo = this.visibles(ruta)[datos.id];
    let actualizado = this.reloj();
    if (previo && actualizado <= previo.actualizado) actualizado = despues(previo.actualizado);
    const { borrado: _b, ...limpio } = datos as T & { id: string; borrado?: true };
    const registro = { ...limpio, actualizado, por } as Registro<T>;
    await this.encolar({ idOp: nuevoId(), ruta, registro: registro as unknown as Registro });
    return registro;
  }

  async borrar(ruta: string, id: string, por: string): Promise<void> {
    const previo = this.visibles(ruta)[id];
    if (!previo || previo.borrado) return;
    let actualizado = this.reloj();
    if (actualizado <= previo.actualizado) actualizado = despues(previo.actualizado);
    await this.encolar({ idOp: nuevoId(), ruta, registro: { id, actualizado, por, borrado: true } });
  }

  private async encolar(op: Operacion) {
    this.cola.push(op);
    await this.guardarCola();
    this.emitir([op.ruta]);
    this.programarEnvio();
  }

  private guardarCola(): Promise<void> {
    const copia = this.cola.map((o) => o);
    this.persistiendoCola = this.persistiendoCola.then(() => this.almacen.set("motor:cola", copia));
    return this.persistiendoCola;
  }

  private async guardarEntrada(ruta: string, e: EntradaCache | null) {
    if (e) {
      this.cache.set(ruta, e);
      await this.almacen.set(`motor:f:${ruta}`, e);
    } else {
      this.cache.delete(ruta);
      await this.almacen.del(`motor:f:${ruta}`);
    }
    this.indice.rutas = [...this.cache.keys()];
    await this.almacen.set("motor:indice", this.indice);
  }

  programarEnvio() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.sincronizar();
    }, this.esperaEnvio);
  }

  // -------------------------------------------------------------------------
  // Sincronización
  // -------------------------------------------------------------------------

  /** Trae las novedades y envía lo pendiente. Si ya está en marcha, se repite al terminar. */
  sincronizar(): Promise<void> {
    if (this.enCurso) {
      this.otraVez = true;
      return this.enCurso;
    }
    this.enCurso = (async () => {
      try {
        do {
          this.otraVez = false;
          await this.ciclo();
        } while (this.otraVez);
      } finally {
        this.enCurso = null;
      }
    })();
    return this.enCurso;
  }

  private async ciclo() {
    if (!this.remoto) return;
    const antes = this.estado;
    if (antes.tipo === "inicial" || antes.tipo === "sincronizado") this.estado = { tipo: "sincronizando" };
    try {
      // Un fichero que no se puede leer no impide enviar los demás; se avisa al final.
      const falloLectura = await this.traer();
      const falloEnvio = await this.enviar();
      const fallo = falloLectura ?? falloEnvio;
      if (fallo) throw fallo;
      // Si quedan cambios es que llegaron mientras se enviaba: ya hay otro envío programado.
      this.estado = this.cola.length ? { tipo: "sincronizando" } : { tipo: "sincronizado", cuando: this.reloj() };
    } catch (e) {
      this.estado = this.estadoDeError(e);
    }
    this.emitir(["__estado__"]);
  }

  private estadoDeError(e: unknown): EstadoSync {
    const cambios = this.cola.length;
    if (e instanceof ErrorRed) return { tipo: "pendiente", cambios, motivo: "sin-red" };
    if (e instanceof ErrorCredenciales) return { tipo: "credenciales", mensaje: e.message };
    const mensaje = e instanceof ErrorRemoto || e instanceof ErrorDescifrado || e instanceof ErrorPermiso
      ? e.message
      : String(e);
    return { tipo: "pendiente", cambios, motivo: "error", mensaje };
  }

  /** Trae lo nuevo. Los fallos de red o credenciales se lanzan; el de un fichero ilegible se devuelve. */
  private async traer(): Promise<unknown> {
    const remoto = this.remoto!;
    const arbol = await remoto.arbol(this.indice.rama, this.indice.etag);
    if (arbol === "sin-cambios") return null;
    const cambiadas = new Set<string>();
    const raiz: Record<string, string> = {};
    let fallo: unknown = null;
    for (const [ruta, sha] of arbol.ficheros) {
      if (!ruta.startsWith(PREFIJO)) {
        raiz[ruta] = sha;
        continue;
      }
      if (!ruta.endsWith(".json")) continue;
      if (this.cache.get(ruta)?.sha === sha) continue;
      try {
        const texto = desdeUtf8(await remoto.blob(sha));
        const registros = leerFichero(await abrirSobre(this.clave, ruta, texto), ruta);
        await this.guardarEntrada(ruta, { sha, registros });
        cambiadas.add(ruta);
      } catch (e) {
        if (e instanceof ErrorRed || e instanceof ErrorCredenciales) throw e;
        fallo ??= e;
      }
    }
    for (const ruta of [...this.cache.keys()]) {
      if (!arbol.ficheros.has(ruta)) {
        await this.guardarEntrada(ruta, null);
        cambiadas.add(ruta);
      }
    }
    // Ficheros de fuera de datos/ que han cambiado (llavero.json, avisos/…): «__raiz__:<ruta>».
    for (const r of Object.keys(raiz)) if (raiz[r] !== this.indice.raiz[r]) cambiadas.add(`__raiz__:${r}`);
    this.indice.raiz = raiz;
    // Si algún fichero no se pudo leer, no se guarda el etag: se reintentará.
    if (!fallo) this.indice.etag = arbol.etag;
    await this.almacen.set("motor:indice", this.indice);
    this.emitir(cambiadas);
    return fallo;
  }

  /** Envía la cola. Red y credenciales cortan; otros fallos se devuelven tras intentar el resto. */
  private async enviar(): Promise<unknown> {
    let fallo: unknown = null;
    for (const ruta of [...new Set(this.cola.map((o) => o.ruta))]) {
      try {
        await this.enviarRuta(ruta);
      } catch (e) {
        if (e instanceof ErrorRed || e instanceof ErrorCredenciales) throw e;
        fallo ??= e;
      }
    }
    return fallo;
  }

  private async enviarRuta(ruta: string) {
    const remoto = this.remoto!;
    const ops = this.cola.filter((o) => o.ruta === ruta);
    if (!ops.length) return;
    for (let intento = 0; ; intento++) {
      const base = this.cache.get(ruta) ?? null;
      const registros = { ...(base?.registros ?? {}) };
      for (const op of ops) registros[op.registro.id] = fusionar(registros[op.registro.id], op.registro);
      const sinCambios = base && JSON.stringify(registros) === JSON.stringify(base.registros);
      try {
        if (!sinCambios) {
          const fichero: FicheroDatos = { esquema: 1, registros: purgarBorrados(registros, this.reloj()) };
          const texto = await cerrarSobre(this.clave, ruta, fichero);
          const sha = await remoto.escribir(ruta, texto, base?.sha ?? null, MENSAJE);
          await this.guardarEntrada(ruta, { sha, registros: fichero.registros });
        }
        const hechas = new Set(ops.map((o) => o.idOp));
        this.cola = this.cola.filter((o) => !hechas.has(o.idOp));
        await this.guardarCola();
        this.emitir([ruta]);
        return;
      } catch (e) {
        if (!(e instanceof ErrorConflicto) || intento + 1 >= MAX_REINTENTOS) throw e;
        // Otro dispositivo escribió antes: se lee su versión y se repite.
        // Si esa versión no se puede descifrar, se lanza el error y NO se pisa.
        const actual = await remoto.leer(ruta);
        if (actual) {
          const reg = leerFichero(await abrirSobre(this.clave, ruta, actual.texto), ruta);
          await this.guardarEntrada(ruta, { sha: actual.sha, registros: reg });
        } else {
          await this.guardarEntrada(ruta, null);
        }
      }
    }
  }
}
