import { avisoEnBytes, cifrarAviso, type Aviso } from "../avisos/push";
import { VAPID_PUBLICA } from "../avisos/vapid";
import {
  enSilencio,
  ID_PLAN,
  planificar,
  quiere,
  RUTA_PLAN,
  RUTA_PROGRAMADOS,
  RUTA_SUSCRIPCIONES,
  WORKFLOW_AVISOS,
  type EnvioCifrado,
  type Programados,
  type Suscripcion,
  type TipoAviso,
} from "../dominio/avisos";
import { hoy } from "../dominio/fechas";
import type { IdPersona } from "../dominio/pareja";
import { RUTA_TAREAS, type Tarea } from "../dominio/tareas";
import { ErrorConflicto } from "../github/errores";
import { aBase64Url, sha256Hex } from "../util/bytes";
import type { Merviri } from "./app";

/**
 * Manda avisos a los móviles de la otra:
 *  - al momento (dibujo, recordatorio…): se juntan unos segundos para mandar
 *    varios en un solo envío (cada envío gasta 1 minuto de GitHub Actions);
 *  - con hora (resumen de la mañana, aniversarios): se recalcula el plan
 *    cuando cambian las tareas o la pareja y se deja en avisos/programados.json.
 * Cada aviso se cifra aquí para el móvil que lo recibe.
 */

export interface Evento {
  tipo: TipoAviso;
  para: IdPersona;
  /** Avisos con el mismo tipo, destinataria y clave se juntan en uno. */
  clave: string;
  texto?: string;
  aviso: (textos: string[]) => Aviso;
}

const MAX_ENVIOS_DIA = 60;
const TTL_AL_MOMENTO = 24 * 3600;
const TTL_PROGRAMADO = 6 * 3600;

export class Avisador {
  private pendientes = new Map<string, { ev: Evento; textos: string[] }>();
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private temporizadorPlan: ReturnType<typeof setTimeout> | null = null;
  ultimoError: string | null = null;

  constructor(private readonly app: Merviri, private readonly espera = 12_000) {}

  private get activo() {
    return VAPID_PUBLICA !== "" && !!this.app.remotoActual();
  }

  encolar(ev: Evento) {
    if (!this.activo || ev.para === this.app.persona) return;
    const k = `${ev.tipo}|${ev.para}|${ev.clave}`;
    const p = this.pendientes.get(k) ?? { ev, textos: [] };
    p.ev = ev;
    if (ev.texto) p.textos.push(ev.texto);
    this.pendientes.set(k, p);
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.vaciar(), this.espera);
  }

  /** Manda ya lo pendiente (también al salir de la app). */
  async vaciar(): Promise<void> {
    if (this.temporizador) { clearTimeout(this.temporizador); this.temporizador = null; }
    const lote = [...this.pendientes.values()];
    this.pendientes.clear();
    if (!lote.length || !this.activo) return;
    // Primero los datos: así, al tocar el aviso, la otra ya tiene lo que se le avisa.
    await this.app.sincronizar().catch(() => undefined);
    const subs = this.app.lista<Suscripcion>(RUTA_SUSCRIPCIONES);
    const ahora = new Date();
    const envios: EnvioCifrado[] = [];
    for (const { ev, textos } of lote) {
      for (const s of subs) {
        if (s.persona !== ev.para || s.id === this.app.dispositivo?.id || !quiere(s, ev.tipo)) continue;
        envios.push(await this.cifrar(s, ev.aviso(textos), enSilencio(s.prefs, ahora), TTL_AL_MOMENTO, "high"));
      }
    }
    await this.disparar(envios);
  }

  /** Aviso de prueba a este mismo dispositivo. */
  async probar(): Promise<void> {
    const yo = this.app.lista<Suscripcion>(RUTA_SUSCRIPCIONES).find((s) => s.id === this.app.dispositivo?.id);
    if (!yo) throw new Error("Activa primero los avisos en este dispositivo.");
    await this.app.sincronizar();
    const env = await this.cifrar(yo, { t: "🔔 Prueba de Merviri", b: "¡Los avisos funcionan! ✨", r: "ajustes", e: "prueba" }, false, 600, "high");
    await this.disparar([env], true);
  }

  private async cifrar(s: Suscripcion, aviso: Aviso, silencio: boolean, ttl: number, urgencia: EnvioCifrado["urgencia"]): Promise<EnvioCifrado> {
    const contenido: Aviso = silencio ? { ...aviso, s: 1 } : aviso;
    const cuerpo = aBase64Url(await cifrarAviso(s, avisoEnBytes(contenido)));
    return { endpoint: s.endpoint, cuerpo, ttl, urgencia };
  }

  private async disparar(envios: EnvioCifrado[], lanzarError = false) {
    if (!envios.length) return;
    const remoto = this.app.remotoActual();
    if (!remoto) return;
    try {
      if (!(await this.contar())) throw new Error(`Hoy ya se han mandado ${MAX_ENVIOS_DIA} avisos desde este dispositivo; mañana más.`);
      await remoto.disparar(WORKFLOW_AVISOS, this.app.motor?.rama ?? "main", { envios: JSON.stringify(envios) });
      this.ultimoError = null;
    } catch (e) {
      this.ultimoError = (e as Error).message;
      if (lanzarError) throw e;
    }
  }

  /** Límite diario por dispositivo, por si algo se desbocara. */
  private async contar(): Promise<boolean> {
    const almacen = this.app.almacenLocal();
    if (!almacen) return true;
    const dia = hoy();
    const c = (await almacen.get<{ dia: string; n: number }>("avisos:contador")) ?? { dia, n: 0 };
    const actual = c.dia === dia ? c : { dia, n: 0 };
    if (actual.n >= MAX_ENVIOS_DIA) return false;
    await almacen.set("avisos:contador", { dia, n: actual.n + 1 });
    return true;
  }

  // -------------------------------------------------------------------------
  // Avisos con hora
  // -------------------------------------------------------------------------

  programar(espera = 8000) {
    if (!this.activo) return;
    if (this.temporizadorPlan) clearTimeout(this.temporizadorPlan);
    this.temporizadorPlan = setTimeout(() => {
      this.temporizadorPlan = null;
      void this.actualizarProgramados().catch((e) => { this.ultimoError = (e as Error).message; });
    }, espera);
  }

  async actualizarProgramados(): Promise<void> {
    const remoto = this.app.remotoActual();
    if (!this.activo || !remoto) return;
    const subs = this.app.lista<Suscripcion>(RUTA_SUSCRIPCIONES);
    const ahora = new Date();
    const plan = planificar({
      tareas: this.app.lista<Tarea>(RUTA_TAREAS), eventos: this.app.eventos(), pareja: this.app.pareja(),
      suscripciones: subs, ahora, hoy: hoy(ahora),
    });
    const huella = await sha256Hex(JSON.stringify(plan.map((p) => [p.cuando, p.aviso, subs.find((s) => s.id === p.dispositivo)?.endpoint])));
    if (this.app.uno<{ id: string; huella: string }>(RUTA_PLAN, ID_PLAN)?.huella === huella) return;

    const contenido: Programados = { version: 1, envios: [] };
    for (const p of plan) {
      const s = subs.find((x) => x.id === p.dispositivo);
      if (!s) continue;
      const env = await this.cifrar(s, p.aviso, enSilencio(s.prefs, new Date(p.cuando)), TTL_PROGRAMADO, "normal");
      contenido.envios.push({ cuando: p.cuando, ...env });
    }
    const texto = JSON.stringify(contenido, null, 1) + "\n";
    for (let intento = 0; ; intento++) {
      const actual = await remoto.leer(RUTA_PROGRAMADOS);
      try {
        await remoto.escribir(RUTA_PROGRAMADOS, texto, actual?.sha ?? null, "Merviri: avisos programados");
        break;
      } catch (e) {
        if (!(e instanceof ErrorConflicto) || intento >= 2) throw e;
      }
    }
    await this.app.guardar(RUTA_PLAN, { id: ID_PLAN, huella });
  }
}
