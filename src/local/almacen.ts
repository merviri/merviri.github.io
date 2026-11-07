/**
 * Almacenamiento del dispositivo. En el navegador, IndexedDB; en las
 * pruebas, memoria. Guarda valores tal cual (también CryptoKey, que el
 * navegador sabe guardar sin exponer la clave).
 */
export interface Almacen {
  get<T>(clave: string): Promise<T | undefined>;
  set<T>(clave: string, valor: T): Promise<void>;
  del(clave: string): Promise<void>;
  claves(): Promise<string[]>;
  vaciar(): Promise<void>;
}

export class AlmacenMemoria implements Almacen {
  private m = new Map<string, unknown>();
  async get<T>(clave: string) {
    return this.m.get(clave) as T | undefined;
  }
  async set<T>(clave: string, valor: T) {
    this.m.set(clave, valor);
  }
  async del(clave: string) {
    this.m.delete(clave);
  }
  async claves() {
    return [...this.m.keys()];
  }
  async vaciar() {
    this.m.clear();
  }
}

export class AlmacenIdb implements Almacen {
  private db: Promise<IDBDatabase>;

  constructor(nombre: string) {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(nombre, 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction("kv", modo);
      const req = fn(t.objectStore("kv"));
      t.oncomplete = () => resolve(req.result as T);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  get<T>(clave: string) {
    return this.tx<T | undefined>("readonly", (s) => s.get(clave));
  }
  async set<T>(clave: string, valor: T) {
    await this.tx("readwrite", (s) => s.put(valor, clave));
  }
  async del(clave: string) {
    await this.tx("readwrite", (s) => s.delete(clave));
  }
  async claves() {
    return (await this.tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys())).map(String);
  }
  async vaciar() {
    await this.tx("readwrite", (s) => s.clear());
  }
}
