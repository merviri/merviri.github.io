import { RemotoMemoria, type EstadoMemoria } from "../github/memoria";
import type { Remoto } from "../github/remoto";

/**
 * Solo en desarrollo: con el token «falso», Merviri usa un repositorio de
 * mentira guardado en localStorage (compartido entre pestañas). Así se puede
 * probar todo, incluida la vinculación entre «dispositivos» (pestañas con
 * ?dispositivo=2), sin tocar GitHub. Nunca se incluye en la versión publicada.
 */
export function remotoFalso(nombre: string): Remoto {
  const clave = `merviri-falso:${nombre}`;
  const cargar = (): EstadoMemoria => JSON.parse(localStorage.getItem(clave) ?? '{"version":0,"ficheros":{}}') as EstadoMemoria;
  const r = new RemotoMemoria(cargar(), (e) => localStorage.setItem(clave, JSON.stringify(e)));
  const fresco = () => { r.estado = cargar(); };
  return {
    info: () => (fresco(), r.info()),
    arbol: (rama, etag) => (fresco(), r.arbol(rama, etag)),
    blob: (sha) => (fresco(), r.blob(sha)),
    leer: (ruta) => (fresco(), r.leer(ruta)),
    escribir: (ruta, texto, sha, mensaje) => (fresco(), r.escribir(ruta, texto, sha, mensaje)),
    // Los avisos no salen de verdad en desarrollo: se apuntan para poder revisarlos.
    disparar: async (workflow, rama, entradas) => {
      const k = `merviri-falso-avisos:${nombre}`;
      const lista = JSON.parse(localStorage.getItem(k) ?? "[]") as unknown[];
      lista.push({ workflow, rama, entradas, cuando: new Date().toISOString() });
      localStorage.setItem(k, JSON.stringify(lista.slice(-50)));
    },
  };
}
