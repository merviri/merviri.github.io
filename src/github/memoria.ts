import { sha256Hex, utf8 } from "../util/bytes";
import { ErrorConflicto, ErrorRed } from "./errores";
import type { Arbol, InfoRepo, Remoto } from "./remoto";

/**
 * Repositorio de mentira, en memoria, con las mismas reglas que GitHub
 * (sha por versión, conflicto si el sha no coincide, etag que cambia con
 * cada escritura). Para las pruebas y para el modo de desarrollo.
 */
export interface EstadoMemoria {
  version: number;
  ficheros: Record<string, { texto: string; sha: string }>;
}

export class RemotoMemoria implements Remoto {
  /** Simula estar sin conexión. */
  sinRed = false;
  /** Escrituras realizadas (para comprobar en las pruebas). */
  escrituras = 0;
  /** Se llama antes de cada escritura (para simular que otro dispositivo escribe a la vez). */
  antesDeEscribir: ((ruta: string) => Promise<void>) | null = null;

  constructor(
    public estado: EstadoMemoria = { version: 0, ficheros: {} },
    private readonly alCambiar: (e: EstadoMemoria) => void = () => {},
    private readonly infoRepo: InfoRepo = { nombre: "merviri/datos", privado: true, escribir: true, rama: "main" },
  ) {}

  private comprobarRed() {
    if (this.sinRed) throw new ErrorRed("Sin conexión (simulada).");
  }

  async info() {
    this.comprobarRed();
    return { ...this.infoRepo };
  }

  async arbol(_rama: string, etag: string | null): Promise<Arbol | "sin-cambios"> {
    this.comprobarRed();
    const actual = `"v${this.estado.version}"`;
    if (etag === actual) return "sin-cambios";
    const ficheros = new Map(Object.entries(this.estado.ficheros).map(([r, f]) => [r, f.sha]));
    return { etag: actual, ficheros };
  }

  async blob(sha: string) {
    this.comprobarRed();
    const f = Object.values(this.estado.ficheros).find((x) => x.sha === sha);
    if (!f) throw new Error(`No existe el blob ${sha}`);
    return utf8(f.texto);
  }

  async leer(ruta: string) {
    this.comprobarRed();
    const f = this.estado.ficheros[ruta];
    return f ? { ...f } : null;
  }

  /** Flujos lanzados (para comprobar en las pruebas y en desarrollo). */
  disparos: { workflow: string; rama: string; entradas: Record<string, string> }[] = [];

  async disparar(workflow: string, rama: string, entradas: Record<string, string>): Promise<void> {
    this.comprobarRed();
    this.disparos.push({ workflow, rama, entradas });
  }

  async escribir(ruta: string, texto: string, sha: string | null, _mensaje = ""): Promise<string> {
    this.comprobarRed();
    if (this.antesDeEscribir) await this.antesDeEscribir(ruta);
    const actual = this.estado.ficheros[ruta];
    if ((actual?.sha ?? null) !== sha) throw new ErrorConflicto(`Conflicto en ${ruta}`, actual ? 409 : 422);
    const nuevo = (await sha256Hex(`${this.estado.version}:${ruta}:${texto}`)).slice(0, 40);
    this.estado.ficheros[ruta] = { texto, sha: nuevo };
    this.estado.version++;
    this.escrituras++;
    this.alCambiar(this.estado);
    return nuevo;
  }
}
