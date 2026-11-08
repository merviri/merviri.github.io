import { AJUSTES_FESTIVOS, eventosFestivos, ID_AJUSTES_FESTIVOS, RUTA_FESTIVOS, type AjustesFestivos } from "../dominio/festivos";
import { festivosLocales } from "../servicios/festivos";
import { RUTA_CAPSULAS, RUTA_FICHAS } from "../dominio/juntas";
import { ErrorDescifrado } from "../cifrado/errores";
import {
  abrirConCodigo,
  abrirConContrasena,
  cambiarContrasena,
  contrasenaCorrecta,
  nuevoCodigoRecuperacion,
  validarLlavero,
  type ClaveAbierta,
  type Llavero,
} from "../cifrado/llavero";
import { abrirSobre, type ClaveDatos } from "../cifrado/sobre";
import { crearVinculo } from "../cifrado/vinculo";
import { desuscribirse, permisoAvisos, suscribirse, suscripcionActual } from "../avisos/suscripcion";
import { estadoToken, huellaToken, ID_ACCESO, RUTA_ACCESO, type Acceso } from "../dominio/acceso";
import { PREFERENCIAS_INICIALES, RUTA_SUSCRIPCIONES, type Preferencias, type Suscripcion } from "../dominio/avisos";
import { PREFIJO_CALENDARIO, rutaDeEvento, type Evento } from "../dominio/calendario";
import { gastosFijosDelMes, RUTA_FIJOS, rutaGastos, type Gasto, type GastoFijo } from "../dominio/gastos";
import { RUTA_TAREAS } from "../dominio/tareas";
import { ServicioAlbum } from "./album";
import { Avisador } from "./avisador";
import type { RepoFotos } from "../github/fotos";
import { REFRESCO_DISPOSITIVO_MS, RUTA_DISPOSITIVOS, type Dispositivo } from "../dominio/dispositivos";
import { hoy, sumarDias, type Fecha } from "../dominio/fechas";
import { ID_PAREJA, PAREJA_INICIAL, problemaPareja, RUTA_PAREJA, type IdPersona, type Pareja } from "../dominio/pareja";
import { ErrorConflicto, ErrorRemoto, ErrorRepoPublico } from "../github/errores";
import type { Conexion, InfoRepo, Remoto } from "../github/remoto";
import type { Almacen } from "../local/almacen";
import { AlmacenCifrado } from "../local/cifrado";
import { Motor, type EstadoSync, type FicheroDatos, type Registro } from "../sync/motor";
import { nuevoId } from "../util/bytes";

/**
 * Estado de Merviri en este dispositivo: clave, conexión, motor de
 * sincronización y las operaciones de configuración y seguridad.
 */

export const RUTA_LLAVERO = "llavero.json";
export const VERSION_APP: string = typeof __MERVIRI_VERSION__ === "string" ? __MERVIRI_VERSION__ : "pruebas";

export interface DispositivoLocal {
  id: string;
  persona: IdPersona;
  nombre: string;
  idClave: string;
}

export interface ConexionLocal extends Conexion {
  huella: string;
  /** Cuándo empezó este dispositivo a usar este token. */
  adoptado: string;
}

export interface Practica {
  activa: boolean;
  proxima: Fecha;
}

/** Lo que se obtiene al comprobar una conexión antes de configurar. */
export interface Comprobacion {
  conexion: Conexion;
  remoto: Remoto;
  info: InfoRepo;
  llavero: { llavero: Llavero; sha: string } | null;
}

export type Fase = "cargando" | "sin-configurar" | "lista";

export type CrearRemoto = (c: Conexion) => Remoto;

const K = { dispositivo: "local:dispositivo", clave: "local:clave" };
const KC = { conexion: "conexion", llavero: "llavero", practica: "practica" };

export class Merviri {
  fase: Fase = "cargando";
  dispositivo: DispositivoLocal | null = null;
  conexion: ConexionLocal | null = null;
  llavero: Llavero | null = null;
  practica: Practica | null = null;
  motor: Motor | null = null;
  avisador: Avisador | null = null;
  album: ServicioAlbum | null = null;
  private fabricaFotos: ((c: Conexion, nombre: string) => RepoFotos) | null = null;
  private remoto: Remoto | null = null;
  private cifrado: AlmacenCifrado | null = null;
  private claveDatos: ClaveDatos | null = null;
  private oyentes = new Set<(motivo: string) => void>();

  constructor(
    private readonly base: Almacen,
    private readonly crearRemoto: CrearRemoto,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  alCambiar(fn: (motivo: string) => void) {
    this.oyentes.add(fn);
  }
  private avisar(motivo: string) {
    for (const fn of this.oyentes) fn(motivo);
  }
  /** Pide a la interfaz que se vuelva a pintar. */
  refrescar() {
    this.avisar("manual");
  }

  // -------------------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------------------

  async arrancar(): Promise<void> {
    const disp = await this.base.get<DispositivoLocal>(K.dispositivo);
    const clave = await this.base.get<CryptoKey>(K.clave);
    if (!disp || !clave) {
      this.fase = "sin-configurar";
      this.avisar("fase");
      return;
    }
    await this.prepararSesion(disp, clave);
    this.fase = "lista";
    this.avisar("fase");
    void this.sincronizar().then(() => this.mantenimiento());
  }

  private async prepararSesion(disp: DispositivoLocal, clave: CryptoKey) {
    this.dispositivo = disp;
    this.claveDatos = { clave, idClave: disp.idClave };
    this.cifrado = new AlmacenCifrado(this.base, clave);
    this.conexion = (await this.cifrado.get<ConexionLocal>(KC.conexion)) ?? null;
    this.llavero = (await this.cifrado.get<Llavero>(KC.llavero)) ?? null;
    this.practica = (await this.cifrado.get<Practica>(KC.practica)) ?? null;
    this.remoto = this.conexion ? this.crearRemoto(this.conexion) : null;
    this.motor = new Motor(this.cifrado, this.claveDatos, this.remoto);
    await this.motor.iniciar();
    this.motor.alCambiar((rutas) => void this.alCambiarDatos(rutas));
    this.avisador = new Avisador(this);
    this.crearAlbum();
  }

  /** Cómo se crean los clientes de los repositorios de fotos (GitHub o, en desarrollo, en memoria). */
  usarFotos(f: (c: Conexion, nombre: string) => RepoFotos) {
    this.fabricaFotos = f;
  }

  private crearAlbum() {
    const c = this.conexion;
    const f = this.fabricaFotos;
    this.album = c && f && this.claveDatos ? new ServicioAlbum(this, (n) => f(c, n), this.claveDatos, this.base) : null;
  }

  private async alCambiarDatos(rutas: Set<string>) {
    if (rutas.has(RUTA_ACCESO)) await this.revisarAcceso().catch(() => undefined);
    if (rutas.has(`__raiz__:${RUTA_LLAVERO}`)) await this.refrescarLlavero().catch(() => undefined);
    if (rutas.has(RUTA_TAREAS) || rutas.has(RUTA_PAREJA) || rutas.has(RUTA_SUSCRIPCIONES) || rutas.has(RUTA_CAPSULAS) || rutas.has(RUTA_FICHAS) ||
      [...rutas].some((r) => r.startsWith(PREFIJO_CALENDARIO))) this.avisador?.programar();
    this.avisar([...rutas].join(","));
  }

  /** Para el avisador: acceso al repositorio y al almacén cifrado del dispositivo. */
  remotoActual(): Remoto | null {
    return this.remoto;
  }
  almacenLocal(): AlmacenCifrado | null {
    return this.cifrado;
  }

  sincronizar(): Promise<void> {
    return this.motor?.sincronizar() ?? Promise.resolve();
  }

  get estadoSync(): EstadoSync {
    return this.motor?.estado ?? { tipo: "inicial" };
  }

  /** Tareas de fondo tras sincronizar: «última vez» del dispositivo y token nuevo. */
  private async mantenimiento() {
    await this.revisarAcceso().catch(() => undefined);
    await this.registrarDispositivo().catch(() => undefined);
    await this.revisarSuscripcion().catch(() => undefined);
    await this.aplicarGastosFijos().catch(() => undefined);
    this.avisador?.programar(15_000);
  }

  // -------------------------------------------------------------------------
  // Avisos (notificaciones)
  // -------------------------------------------------------------------------

  miSuscripcion(): Suscripcion | undefined {
    return this.dispositivo ? this.uno<Suscripcion>(RUTA_SUSCRIPCIONES, this.dispositivo.id) : undefined;
  }

  async activarAvisos() {
    if (!this.dispositivo) throw new Error("Este dispositivo no está configurado.");
    const datos = await suscribirse();
    await this.guardar<Suscripcion>(RUTA_SUSCRIPCIONES, {
      id: this.dispositivo.id, persona: this.persona, nombre: this.dispositivo.nombre, ...datos,
      prefs: this.miSuscripcion()?.prefs ?? PREFERENCIAS_INICIALES,
    });
    await this.sincronizar();
  }

  async desactivarAvisos() {
    await desuscribirse().catch(() => undefined);
    if (this.miSuscripcion()) await this.borrar(RUTA_SUSCRIPCIONES, this.dispositivo!.id);
    await this.sincronizar();
  }

  async guardarPreferencias(prefs: Preferencias) {
    const s = this.miSuscripcion();
    if (!s) throw new Error("Activa primero los avisos en este dispositivo.");
    await this.guardar<Suscripcion>(RUTA_SUSCRIPCIONES, { ...s, prefs });
  }

  /** Al abrir: si el navegador cambió la suscripción (o se quitó el permiso), se actualiza. */
  private async revisarSuscripcion() {
    const s = this.miSuscripcion();
    if (!s || !this.dispositivo) return;
    if (permisoAvisos() !== "granted") {
      await this.borrar(RUTA_SUSCRIPCIONES, s.id);
      return;
    }
    const actual = await suscripcionActual(true);
    if (!actual) return;
    if (actual.endpoint !== s.endpoint || actual.p256dh !== s.p256dh || actual.auth !== s.auth ||
      s.persona !== this.persona || s.nombre !== this.dispositivo.nombre) {
      await this.guardar<Suscripcion>(RUTA_SUSCRIPCIONES, { ...s, ...actual, persona: this.persona, nombre: this.dispositivo.nombre });
    }
  }

  // -------------------------------------------------------------------------
  // Configuración: comprobar, crear, unirse
  // -------------------------------------------------------------------------

  async comprobar(conexion: Conexion): Promise<Comprobacion> {
    const remoto = this.crearRemoto(conexion);
    const info = await remoto.info();
    if (!info.privado) {
      throw new ErrorRepoPublico("Ese repositorio es público. Merviri solo guarda datos en un repositorio privado.");
    }
    if (info.escribir === false) throw new ErrorRemoto("El token no tiene permiso de escritura en ese repositorio.");
    const f = await remoto.leer(RUTA_LLAVERO);
    let llavero: Comprobacion["llavero"] = null;
    if (f) {
      let j: unknown;
      try {
        j = JSON.parse(f.texto);
      } catch {
        j = null;
      }
      if (!validarLlavero(j)) throw new ErrorRemoto("Ese repositorio tiene un llavero.json que Merviri no reconoce.");
      llavero = { llavero: j, sha: f.sha };
    }
    return { conexion, remoto, info, llavero };
  }

  /** Lee la pareja del repositorio con una clave recién abierta (antes de instalar). */
  async leerPareja(c: Comprobacion, abierta: ClaveAbierta): Promise<Pareja> {
    const f = await c.remoto.leer(RUTA_PAREJA);
    if (!f) return PAREJA_INICIAL;
    const datos = (await abrirSobre({ clave: abierta.clave, idClave: abierta.idClave }, RUTA_PAREJA, f.texto)) as FicheroDatos;
    const p = datos?.registros?.[ID_PAREJA] as unknown as Pareja | undefined;
    return p && !problemaPareja(p) ? { id: ID_PAREJA, personas: p.personas, juntasDesde: p.juntasDesde } : PAREJA_INICIAL;
  }

  /** Primera vez: escribe el llavero y los datos iniciales. */
  async crear(c: Comprobacion, llavero: Llavero, abierta: ClaveAbierta, pareja: Pareja, persona: IdPersona, nombre: string) {
    const problema = problemaPareja(pareja);
    if (problema) throw new Error(problema);
    try {
      await c.remoto.escribir(RUTA_LLAVERO, JSON.stringify(llavero, null, 2) + "\n", null, "Merviri: llavero");
    } catch (e) {
      if (e instanceof ErrorConflicto) {
        throw new Error("Mientras tanto se ha creado Merviri en ese repositorio desde otro dispositivo. Vuelve atrás y únete.");
      }
      throw e;
    }
    await this.instalar(c, llavero, abierta, persona, nombre);
    const motor = this.motor!;
    await motor.guardar(RUTA_PAREJA, pareja, persona);
    await motor.guardar<Acceso>(RUTA_ACCESO, {
      id: ID_ACCESO, token: c.conexion.token.trim(), caduca: c.conexion.caduca, huella: this.conexion!.huella,
    }, persona);
    await this.registrarDispositivo(true);
    await this.sincronizar();
  }

  /** Unirse a un Merviri que ya existe (con la clave ya abierta). */
  async unirse(c: Comprobacion, abierta: ClaveAbierta, persona: IdPersona, nombre: string) {
    if (!c.llavero) throw new Error("No hay ningún Merviri en ese repositorio.");
    await this.instalar(c, c.llavero.llavero, abierta, persona, nombre);
    await this.sincronizar();
    await this.registrarDispositivo(true);
    await this.revisarAcceso().catch(() => undefined);
  }

  /** Abre el llavero con el código de recuperación y pone una contraseña nueva. */
  async recuperar(c: Comprobacion, codigo: string, nueva: string, pista: string | null): Promise<{ abierta: ClaveAbierta; c: Comprobacion }> {
    if (!c.llavero) throw new Error("No hay ningún Merviri en ese repositorio.");
    const abierta = await abrirConCodigo(c.llavero.llavero, codigo).catch((e) => {
      throw e instanceof ErrorDescifrado ? new Error("Ese código de recuperación no es correcto.") : e;
    });
    const llavero = await cambiarContrasena(c.llavero.llavero, abierta, nueva, pista);
    const sha = await c.remoto.escribir(RUTA_LLAVERO, JSON.stringify(llavero, null, 2) + "\n", c.llavero.sha, "Merviri: llavero");
    return { abierta, c: { ...c, llavero: { llavero, sha } } };
  }

  private async instalar(c: Comprobacion, llavero: Llavero, abierta: ClaveAbierta, persona: IdPersona, nombre: string) {
    const disp: DispositivoLocal = { id: nuevoId(), persona, nombre: nombre.trim() || "Dispositivo", idClave: abierta.idClave };
    // Se empieza de cero en este dispositivo.
    await this.base.vaciar();
    await this.base.set(K.clave, abierta.clave);
    const cifrado = new AlmacenCifrado(this.base, abierta.clave);
    const conexion: ConexionLocal = {
      propietario: c.conexion.propietario, repositorio: c.conexion.repositorio, token: c.conexion.token.trim(),
      caduca: c.conexion.caduca, huella: await huellaToken(c.conexion.token), adoptado: this.ahora().toISOString(),
    };
    await cifrado.set(KC.conexion, conexion);
    await cifrado.set(KC.llavero, llavero);
    await cifrado.set<Practica>(KC.practica, { activa: true, proxima: sumarDias(hoy(this.ahora()), 30) });
    await this.base.set(K.dispositivo, disp);
    await this.prepararSesion(disp, abierta.clave);
    this.motor!.setRemoto(this.remoto, c.info.rama);
    this.fase = "lista";
    this.avisar("fase");
  }

  /** Borra todo lo de Merviri en este dispositivo (no toca GitHub). */
  async olvidarDispositivo() {
    await this.base.vaciar();
    this.dispositivo = null;
    this.conexion = null;
    this.motor = null;
    this.fase = "sin-configurar";
    this.avisar("fase");
  }

  // -------------------------------------------------------------------------
  // Datos de la pareja y dispositivos
  // -------------------------------------------------------------------------

  get persona(): IdPersona {
    return this.dispositivo?.persona ?? "p1";
  }

  /** Atajos para las vistas: leer y escribir colecciones como la persona de este dispositivo. */
  lista<T extends object>(ruta: string): Registro<T>[] {
    return this.motor?.lista<T>(ruta) ?? [];
  }
  uno<T extends object>(ruta: string, id: string): Registro<T> | undefined {
    return this.motor?.uno<T>(ruta, id);
  }
  guardar<T extends object>(ruta: string, datos: T & { id: string }): Promise<Registro<T>> {
    if (!this.motor) throw new Error("Merviri no está lista.");
    return this.motor.guardar<T>(ruta, datos, this.persona);
  }
  borrar(ruta: string, id: string): Promise<void> {
    if (!this.motor) throw new Error("Merviri no está lista.");
    return this.motor.borrar(ruta, id, this.persona);
  }

  /**
   * Apunta los gastos fijos de este mes que ya han llegado. El id es fijo por
   * mes, así que si los dos móviles lo hacen a la vez no se duplican; y si se
   * borró a mano, no se vuelve a crear.
   */
  async aplicarGastosFijos(): Promise<void> {
    if (!this.motor) return;
    const fijos = this.lista<GastoFijo>(RUTA_FIJOS);
    for (const g of gastosFijosDelMes(fijos, hoy(this.ahora()))) {
      const f = fijos.find((x) => x.id === g.fijo)!;
      if (!this.motor.existe(rutaGastos(f.bote), g.id)) await this.guardar<Gasto>(rutaGastos(f.bote), g);
    }
  }

  /** Todos los eventos del calendario (de todos los ficheros). */
  eventos(): Registro<Evento>[] {
    if (!this.motor) return [];
    return this.motor.rutasCon(PREFIJO_CALENDARIO).flatMap((r) => this.lista<Evento>(r));
  }

  /** Los eventos y, además, los festivos de Valladolid (no se guardan: se calculan). */
  eventosConFestivos(): Evento[] {
    const aj = this.uno<AjustesFestivos>(RUTA_FESTIVOS, ID_AJUSTES_FESTIVOS) ?? AJUSTES_FESTIVOS;
    return [...this.eventos(), ...eventosFestivos(aj, festivosLocales())];
  }

  /** Guarda un evento en su fichero; si cambió de fichero (otro año, o pasa a repetirse), lo quita del anterior. */
  async guardarEvento(e: Evento, previo: Evento | null): Promise<void> {
    const ruta = rutaDeEvento(e);
    if (previo && rutaDeEvento(previo) !== ruta) await this.borrar(rutaDeEvento(previo), previo.id);
    await this.guardar<Evento>(ruta, e);
  }

  async borrarEvento(e: Evento): Promise<void> {
    await this.borrar(rutaDeEvento(e), e.id);
  }

  pareja(): Pareja {
    const p = this.motor?.uno<Pareja>(RUTA_PAREJA, ID_PAREJA);
    return p ? { id: ID_PAREJA, personas: p.personas, juntasDesde: p.juntasDesde ?? null } : PAREJA_INICIAL;
  }

  async guardarPareja(p: Pareja) {
    const problema = problemaPareja(p);
    if (problema) throw new Error(problema);
    await this.motor!.guardar(RUTA_PAREJA, p, this.persona);
  }

  dispositivos(): Dispositivo[] {
    return (this.motor?.lista<Dispositivo>(RUTA_DISPOSITIVOS) ?? []).sort((a, b) => b.ultimaVez.localeCompare(a.ultimaVez));
  }

  async guardarEsteDispositivo(persona: IdPersona, nombre: string) {
    if (!this.dispositivo) return;
    this.dispositivo = { ...this.dispositivo, persona, nombre: nombre.trim() || this.dispositivo.nombre };
    await this.base.set(K.dispositivo, this.dispositivo);
    await this.registrarDispositivo(true);
  }

  /** Apunta este dispositivo (como mucho cada 3 horas, salvo que se fuerce). */
  async registrarDispositivo(forzar = false) {
    if (!this.motor || !this.dispositivo || !this.conexion) return;
    const previo = this.motor.uno<Dispositivo>(RUTA_DISPOSITIVOS, this.dispositivo.id);
    const ahora = this.ahora();
    const reciente = previo && ahora.getTime() - new Date(previo.ultimaVez).getTime() < REFRESCO_DISPOSITIVO_MS;
    const igual = previo && previo.nombre === this.dispositivo.nombre && previo.persona === this.dispositivo.persona &&
      previo.huellaToken === this.conexion.huella && previo.version === VERSION_APP;
    if (!forzar && reciente && igual) return;
    await this.motor.guardar<Dispositivo>(RUTA_DISPOSITIVOS, {
      id: this.dispositivo.id, nombre: this.dispositivo.nombre, persona: this.dispositivo.persona,
      ultimaVez: ahora.toISOString(), huellaToken: this.conexion.huella, version: VERSION_APP,
    }, this.persona);
  }

  async olvidarOtroDispositivo(id: string) {
    await this.motor?.borrar(RUTA_DISPOSITIVOS, id, this.persona);
  }

  // -------------------------------------------------------------------------
  // Token de GitHub
  // -------------------------------------------------------------------------

  estadoToken() {
    return estadoToken(this.conexion?.caduca ?? null, hoy(this.ahora()));
  }

  /** Comprueba un token nuevo, lo deja (cifrado) para los demás dispositivos y lo usa aquí. */
  async renovarToken(token: string, caduca: Fecha | null) {
    if (!this.conexion || !this.motor) throw new Error("Este dispositivo no está configurado.");
    const nueva: Conexion = { propietario: this.conexion.propietario, repositorio: this.conexion.repositorio, token: token.trim(), caduca };
    await this.comprobar(nueva);
    const huella = await huellaToken(token);
    await this.adoptar(nueva, huella);
    await this.motor.guardar<Acceso>(RUTA_ACCESO, { id: ID_ACCESO, token: nueva.token, caduca, huella }, this.persona);
    await this.registrarDispositivo(true);
    await this.sincronizar();
  }

  private async adoptar(c: Conexion, huella: string) {
    this.conexion = { ...c, huella, adoptado: this.ahora().toISOString() };
    await this.cifrado!.set(KC.conexion, this.conexion);
    this.remoto = this.crearRemoto(this.conexion);
    this.motor!.setRemoto(this.remoto);
    this.crearAlbum();
  }

  /** Si otro dispositivo dejó un token nuevo, se prueba y se adopta. */
  private async revisarAcceso() {
    if (!this.motor || !this.conexion) return;
    const a = this.motor.uno<Acceso>(RUTA_ACCESO, ID_ACCESO);
    if (!a || a.huella === this.conexion.huella || a.actualizado <= this.conexion.adoptado) return;
    const nueva: Conexion = { propietario: this.conexion.propietario, repositorio: this.conexion.repositorio, token: a.token, caduca: a.caduca };
    await this.crearRemoto(nueva).info();
    await this.adoptar(nueva, a.huella);
    await this.registrarDispositivo(true);
    this.avisar("token");
  }

  /** ¿Usan ya todos los dispositivos el token que hay en acceso.json? */
  tokenAlDia(d: Dispositivo): boolean {
    const a = this.motor?.uno<Acceso>(RUTA_ACCESO, ID_ACCESO);
    return !a || d.huellaToken === a.huella;
  }

  // -------------------------------------------------------------------------
  // Contraseña, recuperación y vinculación
  // -------------------------------------------------------------------------

  /** Lee el llavero de GitHub (por si se cambió la contraseña en otro dispositivo). */
  private async llaveroRemoto(): Promise<{ llavero: Llavero; sha: string }> {
    if (!this.remoto) throw new Error("Este dispositivo no está conectado.");
    const f = await this.remoto.leer(RUTA_LLAVERO);
    if (!f) throw new Error("No se encuentra el llavero en GitHub.");
    const j = JSON.parse(f.texto) as unknown;
    if (!validarLlavero(j)) throw new Error("El llavero de GitHub no es válido.");
    this.llavero = j;
    await this.cifrado!.set(KC.llavero, j);
    return { llavero: j, sha: f.sha };
  }

  private async refrescarLlavero() {
    await this.llaveroRemoto();
  }

  /** Comprueba la contraseña (con el llavero de GitHub si hay red; si no, con la copia local). */
  async comprobarContrasena(contrasena: string): Promise<boolean> {
    let llavero = this.llavero;
    try {
      llavero = (await this.llaveroRemoto()).llavero;
    } catch {
      /* sin red: se usa la copia */
    }
    if (!llavero) throw new Error("No hay llavero en este dispositivo.");
    return contrasenaCorrecta(llavero, contrasena);
  }

  async crearCodigoVinculo(contrasena: string): Promise<string> {
    if (!this.conexion) throw new Error("Este dispositivo no está conectado.");
    if (!(await this.comprobarContrasena(contrasena))) throw new Error("La contraseña no es correcta.");
    const { propietario, repositorio, token, caduca } = this.conexion;
    return crearVinculo({ propietario, repositorio, token, caduca }, contrasena);
  }

  /** Cambia la contraseña usando la actual o el código de recuperación. */
  async cambiarContrasena(actualOCodigo: string, nueva: string, pista: string | null, conCodigo = false) {
    const { llavero, sha } = await this.llaveroRemoto();
    let abierta: ClaveAbierta;
    try {
      abierta = conCodigo ? await abrirConCodigo(llavero, actualOCodigo) : await abrirConContrasena(llavero, actualOCodigo);
    } catch (e) {
      if (e instanceof ErrorDescifrado) throw new Error(conCodigo ? "El código no es correcto." : "La contraseña actual no es correcta.");
      throw e;
    }
    const nuevo = await cambiarContrasena(llavero, abierta, nueva, pista);
    await this.remoto!.escribir(RUTA_LLAVERO, JSON.stringify(nuevo, null, 2) + "\n", sha, "Merviri: llavero");
    this.llavero = nuevo;
    await this.cifrado!.set(KC.llavero, nuevo);
  }

  async nuevoCodigo(contrasena: string): Promise<string> {
    const { llavero, sha } = await this.llaveroRemoto();
    let abierta: ClaveAbierta;
    try {
      abierta = await abrirConContrasena(llavero, contrasena);
    } catch (e) {
      if (e instanceof ErrorDescifrado) throw new Error("La contraseña no es correcta.");
      throw e;
    }
    const r = await nuevoCodigoRecuperacion(llavero, abierta);
    await this.remoto!.escribir(RUTA_LLAVERO, JSON.stringify(r.llavero, null, 2) + "\n", sha, "Merviri: llavero");
    this.llavero = r.llavero;
    await this.cifrado!.set(KC.llavero, r.llavero);
    return r.codigo;
  }

  // -------------------------------------------------------------------------
  // Recordatorio para practicar la contraseña
  // -------------------------------------------------------------------------

  tocaPracticar(): boolean {
    return !!this.practica?.activa && this.practica.proxima <= hoy(this.ahora());
  }

  async practicaHecha(acierto: boolean) {
    const dias = acierto ? 30 : 7;
    this.practica = { activa: this.practica?.activa ?? true, proxima: sumarDias(hoy(this.ahora()), dias) };
    await this.cifrado!.set(KC.practica, this.practica);
  }

  async activarPractica(activa: boolean) {
    this.practica = { activa, proxima: this.practica?.proxima ?? sumarDias(hoy(this.ahora()), 30) };
    await this.cifrado!.set(KC.practica, this.practica);
  }
}
