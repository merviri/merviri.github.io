import { cifrar, descifrar } from "../cifrado/aes";
import { desdeUtf8, utf8 } from "../util/bytes";
import type { Almacen } from "./almacen";

/**
 * Almacén cifrado: lo que Merviri guarda en el dispositivo (copia de los
 * datos, cambios pendientes, conexión) también va cifrado con la clave de
 * datos. Cada valor lleva su nombre como dato asociado.
 */
interface ValorCifrado {
  iv: Uint8Array<ArrayBuffer>;
  ct: Uint8Array<ArrayBuffer>;
}

export class AlmacenCifrado {
  constructor(
    private readonly base: Almacen,
    private readonly clave: CryptoKey,
    private readonly prefijo = "c:",
  ) {}

  async get<T>(nombre: string): Promise<T | undefined> {
    const v = await this.base.get<ValorCifrado>(this.prefijo + nombre);
    if (!v) return undefined;
    const claro = await descifrar(this.clave, v.iv, v.ct, utf8(this.prefijo + nombre));
    return JSON.parse(desdeUtf8(claro)) as T;
  }

  async set<T>(nombre: string, valor: T): Promise<void> {
    const { iv, ct } = await cifrar(this.clave, utf8(JSON.stringify(valor)), utf8(this.prefijo + nombre));
    await this.base.set<ValorCifrado>(this.prefijo + nombre, { iv, ct });
  }

  async del(nombre: string): Promise<void> {
    await this.base.del(this.prefijo + nombre);
  }
}
