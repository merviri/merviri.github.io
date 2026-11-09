import { abrirBinario, cerrarBinario } from "../cifrado/binario";
import type { ClaveDatos } from "../cifrado/sobre";
import {
  archivosDe,
  baseDeArchivo,
  elegirRepo,
  fechaDeNombre,
  nombreDescarga,
  PREFIJO_ALBUM,
  RUTA_ALBUMES,
  rutaArchivo,
  rutaFotos,
  rutaParte,
  type Album,
  type Foto,
  type Tamano,
} from "../dominio/album";
import { hoy, type Fecha } from "../dominio/fechas";
import { fechaExif } from "../fotos/exif";
import { reducidas } from "../fotos/imagen";
import { esVideo, prepararVideo, trocear } from "../fotos/video";
import { crearZip } from "../fotos/zip";
import type { RepoFotos } from "../github/fotos";
import { ErrorRemoto } from "../github/errores";
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
  /** Qué está haciendo ahora (p. ej., «Comprimiendo el vídeo… 40 %»). */
  detalle: string | null;
}

const noEsta = (e: unknown) => e instanceof ErrorRemoto && e.status === 404;
const UN_DIA = 24 * 3600 * 1000;

export class ServicioAlbum {
  private repos = new Map<string, RepoFotos>();
  private urls = new Map<string, string>();
  /** Fotos que ya se han intentado arreglar en esta sesión (para no repetir). */
  private arregladas = new Map<string, Promise<Registro<Foto> | null>>();
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
    this.progreso = { total: archivos.length, hechas: 0, fallos: [], activa: true, sinFecha: [], detalle: null };
    alAvanzar();
    // Que no se apague la pantalla mientras sube.
    let bloqueo: WakeLockSentinel | null = null;
    try { bloqueo = await navigator.wakeLock?.request("screen"); } catch { /* no disponible */ }
    let subidas = 0;
    const hechas = new Map<string, File>();
    try {
      for (const archivo of archivos) {
        if (this.cancelar) break;
        try {
          if (esVideo(archivo)) {
            const r = await this.subirVideo(archivo, album, (t) => { this.progreso!.detalle = t; alAvanzar(); });
            if (r.sinFecha) this.progreso.sinFecha.push(r.id);
          } else {
            const r = await this.subirUna(archivo, album);
            if (r.sinFecha) this.progreso.sinFecha.push(r.id);
            hechas.set(r.id, archivo);
          }
          this.progreso.detalle = null;
          subidas++;
        } catch (e) {
          this.progreso.fallos.push(`${archivo.name}: ${(e as Error).message}`);
        }
        this.progreso.hechas++;
        alAvanzar();
      }
      // Comprobación final: que esté todo en GitHub (por si se cruzó con
      // otra subida o con «vaciar la papelera» en el otro móvil).
      if (hechas.size) await this.comprobarSubidas(hechas).catch(() => undefined);
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

  /** Fecha y hora (de Madrid) de algo, sacadas de un instante. */
  private static fechaHora(d: Date): { fecha: Fecha; hora: string } {
    return { fecha: hoy(d), hora: new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) };
  }

  /**
   * Un vídeo: se comprime en el móvil, se saca su portada y se sube cifrado en
   * trozos. Al terminar se comprueba que estén todos los trozos.
   */
  private async subirVideo(archivo: File, album: string | null, detalle: (t: string) => void): Promise<{ id: string; sinFecha: boolean }> {
    detalle("Preparando el vídeo…");
    const v = await prepararVideo(archivo, detalle);
    const deNombre = v.grabado ? null : fechaDeNombre(archivo.name, hoy());
    const cuando = v.grabado ? ServicioAlbum.fechaHora(v.grabado) : deNombre ?? ServicioAlbum.fechaHora(new Date(archivo.lastModified || Date.now()));
    const sinFecha = !v.grabado && !deNombre && cuando.fecha === hoy();
    const partes = trocear(v.datos);
    const mini = v.mini ? new Uint8Array(await v.mini.arrayBuffer()) : null;
    const vista = v.vista ? new Uint8Array(await v.vista.arrayBuffer()) : null;
    const bytes = v.datos.length + (mini?.length ?? 0) + (vista?.length ?? 0);
    const repo = elegirRepo(this.fotos(), bytes);
    if (!repo) throw new Error("Los cinco repositorios de fotos están llenos.");
    const id = nuevoId();
    const base = `fotos/${cuando.fecha.slice(0, 4)}/${cuando.fecha.slice(5, 7)}/${id}`;
    const r = this.repo(repo);
    const foto: Foto = {
      id, repo, base, fecha: cuando.fecha, hora: cuando.hora ?? null, nombre: archivo.name.slice(0, 120), tipo: v.tipo,
      ancho: v.ancho, alto: v.alto, bytes, sinVista: false, albumes: album ? [album] : [], favorita: false, papelera: null,
      video: { duracion: Math.round(v.duracion * 10) / 10, partes: partes.length },
    };
    // Sin portada se sube una imagen vacía, para que el vídeo tenga sus ficheros completos.
    const vacia = new Uint8Array(0);
    await r.subir(rutaArchivo(foto, "mini"), await cerrarBinario(this.clave, rutaArchivo(foto, "mini"), mini ?? vacia));
    await r.subir(rutaArchivo(foto, "vista"), await cerrarBinario(this.clave, rutaArchivo(foto, "vista"), vista ?? vacia));
    if (mini) await this.cache.set(`foto:${id}:mini`, await cerrarBinario(this.clave, rutaArchivo(foto, "mini"), mini)).catch(() => undefined);
    const subir = async (i: number) => r.subir(rutaParte(foto, i), await cerrarBinario(this.clave, rutaParte(foto, i), partes[i]!));
    for (let i = 0; i < partes.length; i++) {
      detalle(`Subiendo el vídeo… ${Math.round((i / partes.length) * 100)} %`);
      await subir(i);
    }
    // Que no falte ningún trozo (se tienen aún en memoria para volver a subirlos).
    const hay = await r.listar().catch(() => null);
    if (hay) for (let i = 0; i < partes.length; i++) if (!hay.has(rutaParte(foto, i))) await subir(i);
    await this.app.guardar<Foto>(rutaFotos(foto.fecha), foto);
    return { id, sinFecha };
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
      const r = await reducidas(archivo);
      mini = r.mini.datos;
      vista = r.vista.datos;
      ancho = r.ancho;
      alto = r.alto;
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
    // Sin miniatura (no se pudo hacer al subirla): se intenta hacer ahora desde el original.
    if (f.sinVista) f = (await this.arreglar(f)) ?? f;
    const real: Tamano = f.sinVista ? "orig" : t;
    const k = `${f.id}:${real}`;
    const hecha = this.urls.get(k);
    if (hecha) return hecha;
    let datos: Uint8Array<ArrayBuffer>;
    try {
      datos = await this.bytes(f, real);
    } catch (e) {
      // Falta en GitHub la miniatura o la vista: se rehacen desde el original.
      if (!noEsta(e) || real === "orig") throw e;
      const arreglada = await this.arreglar(f);
      if (!arreglada) throw e;
      datos = await this.bytes(arreglada, real);
    }
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

  async original(f: Foto, alAvanzar?: (hechos: number, total: number) => void): Promise<Blob> {
    if (f.video) {
      const trozos: Uint8Array<ArrayBuffer>[] = [];
      for (let i = 0; i < f.video.partes; i++) {
        alAvanzar?.(i, f.video.partes);
        const cifrado = await this.repo(f.repo).bajar(rutaParte(f, i));
        trozos.push(await abrirBinario(this.clave, rutaParte(f, i), cifrado));
      }
      alAvanzar?.(f.video.partes, f.video.partes);
      return new Blob(trozos, { type: f.tipo });
    }
    return new Blob([await this.bytes(f, "orig")], { type: f.tipo });
  }

  /** Para descargar: el original o, si se perdió, la vista de 1600 px. */
  async descarga(f: Foto): Promise<{ blob: Blob; reducida: boolean }> {
    try {
      return { blob: await this.original(f), reducida: false };
    } catch (e) {
      if (!noEsta(e) || f.sinVista) throw e;
      if (!f.sinOriginal) await this.guardarFoto({ ...f, sinOriginal: true }).catch(() => undefined);
      if (f.video) throw new Error("Se ha perdido parte de este vídeo: no se puede descargar.");
      return { blob: new Blob([await this.bytes(f, "vista")], { type: "image/jpeg" }), reducida: true };
    }
  }

  /**
   * Rehace la miniatura y la vista desde el original y las sube. Devuelve la
   * ficha nueva, o null si no se puede (el navegador no sabe leer ese formato
   * o el original no está). Solo se intenta una vez por sesión.
   */
  arreglar(f: Foto): Promise<Registro<Foto> | null> {
    if (f.video) return Promise.resolve(null);
    let p = this.arregladas.get(f.id);
    if (!p) {
      p = (async () => {
        try {
          const orig = await this.original(f);
          const r = await reducidas(orig);
          const repo = this.repo(f.repo);
          const conVista = { ...f, sinVista: false };
          for (const [t, datos] of [["mini", r.mini.datos], ["vista", r.vista.datos]] as const) {
            const cifrado = await cerrarBinario(this.clave, rutaArchivo(conVista, t), datos);
            await repo.subir(rutaArchivo(conVista, t), cifrado);
            if (t === "mini") await this.cache.set(`foto:${f.id}:mini`, cifrado).catch(() => undefined);
          }
          const actual = this.fotos().find((x) => x.id === f.id) ?? f;
          const { actualizado: _a, por: _p, ...limpia } = actual as Registro<Foto>;
          return await this.app.guardar<Foto>(rutaFotos(actual.fecha), {
            ...limpia, sinVista: false, ancho: actual.ancho ?? r.ancho, alto: actual.alto ?? r.alto,
          });
        } catch {
          return null;
        }
      })();
      this.arregladas.set(f.id, p);
    }
    return p;
  }

  /** Tras subir: si falta algún fichero en GitHub, se vuelve a subir desde el archivo. */
  private async comprobarSubidas(hechas: Map<string, File>) {
    const fotos = this.fotos().filter((f) => hechas.has(f.id));
    for (const repo of new Set(fotos.map((f) => f.repo))) {
      const hay = await this.repo(repo).listar();
      for (const f of fotos.filter((x) => x.repo === repo)) {
        if (archivosDe(f).every((r) => hay.has(r))) continue;
        const archivo = hechas.get(f.id)!;
        const original = new Uint8Array(await archivo.arrayBuffer());
        const r = this.repo(repo);
        if (!hay.has(rutaArchivo(f, "orig"))) await r.subir(rutaArchivo(f, "orig"), await cerrarBinario(this.clave, rutaArchivo(f, "orig"), original));
        if (!f.sinVista && (!hay.has(rutaArchivo(f, "mini")) || !hay.has(rutaArchivo(f, "vista")))) {
          const red = await reducidas(archivo);
          await r.subir(rutaArchivo(f, "mini"), await cerrarBinario(this.clave, rutaArchivo(f, "mini"), red.mini.datos));
          await r.subir(rutaArchivo(f, "vista"), await cerrarBinario(this.clave, rutaArchivo(f, "vista"), red.vista.datos));
        }
      }
    }
  }

  /**
   * Revisión de fondo (como mucho una vez al día por dispositivo): marca las
   * fotos cuyo original ya no está y rehace las miniaturas que falten.
   */
  async revisar(forzar = false): Promise<{ sinOriginal: number; arregladas: number }> {
    const ultima = await this.cache.get<number>("album:revision").catch(() => undefined);
    if (!forzar && ultima && Date.now() - ultima < UN_DIA) return { sinOriginal: 0, arregladas: 0 };
    await this.cache.set("album:revision", Date.now()).catch(() => undefined);
    const fotos = this.fotos().filter((f) => !f.papelera);
    let sinOriginal = 0;
    let arregladas = 0;
    for (const repo of new Set(fotos.map((f) => f.repo))) {
      const hay = await this.repo(repo).listar();
      for (const f of fotos.filter((x) => x.repo === repo)) {
        const falta = archivosDe(f).filter((r) => !hay.has(r));
        if (!falta.length) {
          if (f.sinOriginal) await this.guardarFoto({ ...f, sinOriginal: false });
          continue;
        }
        if (falta.some((r) => /\.orig(\.\d+)?$/.test(r))) {
          if (!f.sinOriginal) { await this.guardarFoto({ ...f, sinOriginal: true }); sinOriginal++; }
        } else if (await this.arreglar(f)) {
          arregladas++;
        }
      }
    }
    return { sinOriginal, arregladas };
  }

  /** Vuelve a subir el original de una foto que lo perdió (desde la galería del móvil). */
  async reponerOriginal(f: Foto, archivo: File): Promise<void> {
    const original = new Uint8Array(await archivo.arrayBuffer());
    await this.repo(f.repo).subir(rutaArchivo(f, "orig"), await cerrarBinario(this.clave, rutaArchivo(f, "orig"), original));
    const actual = this.fotos().find((x) => x.id === f.id) ?? f;
    const { actualizado: _a, por: _p, ...limpia } = actual as Registro<Foto>;
    await this.app.guardar<Foto>(rutaFotos(actual.fecha), {
      ...limpia, sinOriginal: false, tipo: archivo.type || actual.tipo, bytes: actual.bytes + original.length,
    });
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
      await this.repo(repo).vaciar((ruta) => bases.has(baseDeArchivo(ruta)));
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
      const d = await this.descarga(f);
      const nombre = nombreDescarga(f, albumes).replace(/\.[a-z0-9]+$/i, (ext) => (d.reducida ? " (copia reducida).jpg" : ext));
      archivos.push({ nombre: `${carpeta}/${nombre}`, datos: new Uint8Array(await d.blob.arrayBuffer()), fecha: new Date(`${f.fecha}T${f.hora ?? "12:00"}:00`) });
      alAvanzar(++i);
    }
    return crearZip(archivos);
  }
}
