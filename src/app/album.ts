import { abrirBinario, cerrarBinario } from "../cifrado/binario";
import type { ClaveDatos } from "../cifrado/sobre";
import {
  elegirRepo,
  fechaDeNombre,
  nombreDescarga,
  PREFIJO_ALBUM,
  RUTA_ALBUMES,
  rutaArchivo,
  rutaFotos,
  type Album,
  type Foto,
  type Tamano,
} from "../dominio/album";
import { hoy, type Fecha } from "../dominio/fechas";
import { fechaExif } from "../fotos/exif";
import { reducir } from "../fotos/imagen";
import { crearZip } from "../fotos/zip";
import type { RepoFotos } from "../github/fotos";
import type { Almacen } from "../local/almacen";
import type { Registro } from "../sync/motor";
import { nuevoId } from "../util/bytes";
import type { Merviri } from "./app";
import { avisarFotos } from "./eventos";

/**
 * Subir, ver y organizar las fotos. Cada foto se cifra en el móvil (tres
 * tamaños) antes de subirla; para verla se baja y se descifra aquí.
 * Las miniaturas se guardan (cifradas) en el dispositivo para no bajarlas
 * cada vez.
 */
export interface Progreso {
  total: number;
  hechas: number;
  fallos: string[];
  activa: boolean;
  /** Fotos que no traían fecha (ni EXIF ni en el nombre): se pusieron con la de hoy. */
  sinFecha: string[];
}

export class ServicioAlbum {
  private repos = new Map<string, RepoFotos>();
  private urls = new Map<string, string>();
  progreso: Progreso | null = null;
  cancelar = false;

  constructor(
    private readonly app: Merviri,
    private readonly crearRepo: (nombre: string) => RepoFotos,
    private readonly clave: ClaveDatos,
    private readonly cache: Almacen,
  ) {}

  private repo(nombre: string): RepoFotos {
    let r = this.repos.get(nombre);
    if (!r) { r = this.crearRepo(nombre); this.repos.set(nombre, r); }
    return r;
  }

  fotos(): Registro<Foto>[] {
    const todas = (this.app.motor?.rutasCon(PREFIJO_ALBUM) ?? []).filter((r) => r !== RUTA_ALBUMES).flatMap((r) => this.app.lista<Foto>(r));
    // Al cambiar una foto de año puede estar un momento en los dos ficheros: vale la más reciente.
    const porId = new Map<string, Registro<Foto>>();
    for (const f of todas) {
      const otra = porId.get(f.id);
      if (!otra || f.actualizado > otra.actualizado) porId.set(f.id, f);
    }
    return [...porId.values()];
  }

  albumes(): Registro<Album>[] {
    return this.app.lista<Album>(RUTA_ALBUMES).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  // -------------------------------------------------------------------------
  // Subir
  // -------------------------------------------------------------------------

  async subir(archivos: File[], album: string | null, alAvanzar: () => void = () => {}): Promise<number> {
    if (this.progreso?.activa) throw new Error("Ya se están subiendo fotos.");
    this.cancelar = false;
    this.progreso = { total: archivos.length, hechas: 0, fallos: [], activa: true, sinFecha: [] };
    alAvanzar();
    // Que no se apague la pantalla mientras sube.
    let bloqueo: WakeLockSentinel | null = null;
    try { bloqueo = await navigator.wakeLock?.request("screen"); } catch { /* no disponible */ }
    let subidas = 0;
    try {
      for (const archivo of archivos) {
        if (this.cancelar) break;
        try {
          const r = await this.subirUna(archivo, album);
          if (r.sinFecha) this.progreso.sinFecha.push(r.id);
          subidas++;
        } catch (e) {
          this.progreso.fallos.push(`${archivo.name}: ${(e as Error).message}`);
        }
        this.progreso.hechas++;
        alAvanzar();
      }
    } finally {
      this.progreso.activa = false;
      await bloqueo?.release().catch(() => undefined);
      alAvanzar();
    }
    if (subidas) {
      const a = album ? this.app.uno<Album>(RUTA_ALBUMES, album) : null;
      avisarFotos(this.app, subidas, a ?? null);
    }
    return subidas;
  }

  private async subirUna(archivo: File, album: string | null): Promise<{ id: string; sinFecha: boolean }> {
    if (!archivo.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png|webp)$/i.test(archivo.name)) throw new Error("No es una foto.");
    const original = new Uint8Array(await archivo.arrayBuffer());
    // La fecha: la de la cámara (EXIF); si no, la del nombre (WhatsApp, capturas…);
    // si no, la del archivo (que en el móvil suele ser la de hoy).
    const exif = fechaExif(original);
    const deNombre = exif ? null : fechaDeNombre(archivo.name, hoy());
    const ahora = new Date(archivo.lastModified || Date.now());
    const fecha = exif?.fecha ?? deNombre?.fecha ?? hoy(ahora);
    const hora = exif?.hora ?? (deNombre ? deNombre.hora : new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora));
    const sinFecha = !exif && !deNombre && fecha === hoy();
    let mini: Uint8Array<ArrayBuffer> | null = null;
    let vista: Uint8Array<ArrayBuffer> | null = null;
    let ancho: number | null = null;
    let alto: number | null = null;
    try {
      const m = await reducir(archivo, 480, 0.75);
      const v = await reducir(archivo, 1600, 0.82);
      mini = m.datos;
      vista = v.datos;
      ancho = m.anchoOriginal;
      alto = m.altoOriginal;
    } catch {
      /* formato que el navegador no sabe abrir (p. ej. HEIC): solo se guarda el original */
    }
    const id = nuevoId();
    const bytes = original.length + (mini?.length ?? 0) + (vista?.length ?? 0);
    const repo = elegirRepo(this.fotos(), bytes);
    if (!repo) throw new Error("Los cinco repositorios de fotos están llenos.");
    const base = `fotos/${fecha.slice(0, 4)}/${fecha.slice(5, 7)}/${id}`;
    const r = this.repo(repo);
    const foto: Foto = {
      id, repo, base, fecha, hora, nombre: archivo.name.slice(0, 120), tipo: archivo.type || "image/jpeg", ancho, alto, bytes,
      sinVista: !mini, albumes: album ? [album] : [], favorita: false, papelera: null,
    };
    if (mini && vista) {
      await r.subir(rutaArchivo(foto, "mini"), await cerrarBinario(this.clave, rutaArchivo(foto, "mini"), mini));
      await r.subir(rutaArchivo(foto, "vista"), await cerrarBinario(this.clave, rutaArchivo(foto, "vista"), vista));
      await this.cache.set(`foto:${id}:mini`, await cerrarBinario(this.clave, rutaArchivo(foto, "mini"), mini));
    }
    await r.subir(rutaArchivo(foto, "orig"), await cerrarBinario(this.clave, rutaArchivo(foto, "orig"), original));
    await this.app.guardar<Foto>(rutaFotos(fecha), foto);
    return { id, sinFecha };
  }

  // -------------------------------------------------------------------------
  // Ver
  // -------------------------------------------------------------------------

  private async bytes(f: Foto, t: Tamano): Promise<Uint8Array<ArrayBuffer>> {
    const ruta = rutaArchivo(f, t);
    const clave = `foto:${f.id}:${t}`;
    if (t === "mini") {
      const guardada = await this.cache.get<Uint8Array<ArrayBuffer>>(clave);
      if (guardada) return abrirBinario(this.clave, ruta, guardada);
    }
    const cifrado = await this.repo(f.repo).bajar(ruta);
    if (t === "mini") await this.cache.set(clave, cifrado).catch(() => undefined);
    return abrirBinario(this.clave, ruta, cifrado);
  }

  /** URL (blob:) de una foto para un <img>. Las vistas grandes solo se guardan en memoria. */
  async url(f: Foto, t: "mini" | "vista"): Promise<string> {
    const real: Tamano = f.sinVista ? "orig" : t;
    const k = `${f.id}:${real}`;
    const hecha = this.urls.get(k);
    if (hecha) return hecha;
    const datos = await this.bytes(f, real);
    const url = URL.createObjectURL(new Blob([datos], { type: real === "orig" ? f.tipo : "image/jpeg" }));
    this.urls.set(k, url);
    // Para no llenar la memoria: como mucho 60 vistas grandes a la vez.
    if (real !== "mini") {
      const grandes = [...this.urls.keys()].filter((x) => !x.endsWith(":mini"));
      for (const viejo of grandes.slice(0, Math.max(0, grandes.length - 60))) {
        URL.revokeObjectURL(this.urls.get(viejo)!);
        this.urls.delete(viejo);
      }
    }
    return url;
  }

  async original(f: Foto): Promise<Blob> {
    return new Blob([await this.bytes(f, "orig")], { type: f.tipo });
  }

  // -------------------------------------------------------------------------
  // Organizar
  // -------------------------------------------------------------------------

  private guardarFoto(f: Foto) {
    return this.app.guardar<Foto>(rutaFotos(f.fecha), f);
  }

  aPapelera(f: Foto) {
    return this.guardarFoto({ ...f, papelera: new Date().toISOString() });
  }

  recuperar(f: Foto) {
    return this.guardarFoto({ ...f, papelera: null });
  }

  favorita(f: Foto) {
    return this.guardarFoto({ ...f, favorita: !f.favorita });
  }

  enAlbum(f: Foto, album: string, dentro: boolean) {
    const albumes = dentro ? [...new Set([...f.albumes, album])] : f.albumes.filter((a) => a !== album);
    return this.guardarFoto({ ...f, albumes });
  }

  /**
   * Cambia el día de unas fotos (p. ej., las que os mandan tarde). La hora se
   * mantiene para que sigan en el mismo orden. Si cambian de año, la ficha
   * pasa al fichero de ese año (los archivos cifrados no se mueven).
   */
  async cambiarFecha(fotos: Foto[], fecha: Fecha): Promise<number> {
    let n = 0;
    for (const f of fotos) {
      const actual = this.fotos().find((x) => x.id === f.id) ?? f;
      if (actual.fecha === fecha) continue;
      const { actualizado: _a, por: _p, ...limpia } = actual as Registro<Foto>;
      await this.app.guardar<Foto>(rutaFotos(fecha), { ...limpia, fecha });
      if (rutaFotos(actual.fecha) !== rutaFotos(fecha)) await this.app.borrar(rutaFotos(actual.fecha), actual.id);
      n++;
    }
    return n;
  }

  /**
   * Vacía la papelera: rehace cada repositorio de fotos sin esas fotos (y sin
   * historial) y quita sus fichas. Devuelve los bytes liberados.
   */
  async vaciarPapelera(): Promise<number> {
    const tiradas = this.fotos().filter((f) => f.papelera);
    const porRepo = new Map<string, Set<string>>();
    for (const f of tiradas) porRepo.set(f.repo, new Set([...(porRepo.get(f.repo) ?? []), f.base]));
    for (const [repo, bases] of porRepo) {
      await this.repo(repo).vaciar((ruta) => bases.has(ruta.replace(/\.(mini|vista|orig)$/, "")));
    }
    for (const f of tiradas) {
      await this.app.borrar(rutaFotos(f.fecha), f.id);
      await this.cache.del(`foto:${f.id}:mini`).catch(() => undefined);
    }
    return tiradas.reduce((n, f) => n + f.bytes, 0);
  }

  /** Nombre con el que se descarga una foto (fecha y, si está en alguno, álbum). */
  nombreDescarga(f: Foto): string {
    return nombreDescarga(f, this.albumes());
  }

  /** ZIP con los originales (para guardarlos en el ordenador). */
  async zip(fotos: Foto[], carpeta: string, alAvanzar: (hechas: number) => void = () => {}): Promise<Blob> {
    const archivos = [];
    const albumes = this.albumes();
    let i = 0;
    for (const f of fotos) {
      archivos.push({ nombre: `${carpeta}/${nombreDescarga(f, albumes)}`, datos: await this.bytes(f, "orig"), fecha: new Date(`${f.fecha}T${f.hora ?? "12:00"}:00`) });
      alAvanzar(++i);
    }
    return crearZip(archivos);
  }
}
