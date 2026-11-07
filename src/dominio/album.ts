import type { Fecha } from "./fechas";

/**
 * Álbum compartido.
 *  - Las fotos (cifradas) van en los repositorios privados fotos-1 … fotos-5;
 *    cuando uno se acerca a 4,5 GB, se pasa al siguiente.
 *  - La ficha de cada foto (fecha, álbumes, favorita, papelera…) va en
 *    `datos/album/<año>.json`, y los álbumes en `datos/album/albumes.json`.
 */
export const REPOS_FOTOS = ["fotos-1", "fotos-2", "fotos-3", "fotos-4", "fotos-5"];
export const LIMITE_REPO = 4.5e9;
export const PREFIJO_ALBUM = "datos/album/";
export const RUTA_ALBUMES = `${PREFIJO_ALBUM}albumes.json`;
export const rutaFotos = (fecha: Fecha) => `${PREFIJO_ALBUM}${fecha.slice(0, 4)}.json`;
export const DIAS_PAPELERA = 30;

export type Tamano = "mini" | "vista" | "orig";

export interface Foto {
  id: string;
  repo: string;
  /** «fotos/AAAA/MM/<id>»: los ficheros son <base>.mini, <base>.vista y <base>.orig. */
  base: string;
  fecha: Fecha;
  hora: string | null;
  nombre: string;
  tipo: string;
  ancho: number | null;
  alto: number | null;
  /** Bytes que ocupa en el repositorio (los tres ficheros). */
  bytes: number;
  /** Si no se pudo hacer la vista reducida (formato raro): solo hay original. */
  sinVista: boolean;
  albumes: string[];
  favorita: boolean;
  /** Cuándo se mandó a la papelera (null = no está). */
  papelera: string | null;
}

export interface Album {
  id: string;
  nombre: string;
  emoji: string;
  /** Si es el álbum de un plan. */
  plan: string | null;
}

export const albumDePlan = (plan: string) => `plan-${plan}`;
export const rutaArchivo = (f: Pick<Foto, "base">, t: Tamano) => `${f.base}.${t}`;

export function usoPorRepo(fotos: Pick<Foto, "repo" | "bytes">[]): Map<string, number> {
  const m = new Map<string, number>(REPOS_FOTOS.map((r) => [r, 0]));
  for (const f of fotos) m.set(f.repo, (m.get(f.repo) ?? 0) + f.bytes);
  return m;
}

/** Repositorio donde subir la siguiente foto (null si están todos llenos). */
export function elegirRepo(fotos: Pick<Foto, "repo" | "bytes">[], siguiente = 0): string | null {
  const uso = usoPorRepo(fotos);
  return REPOS_FOTOS.find((r) => (uso.get(r) ?? 0) + siguiente <= LIMITE_REPO) ?? null;
}

const orden = (a: Foto, b: Foto) => `${b.fecha} ${b.hora ?? ""}`.localeCompare(`${a.fecha} ${a.hora ?? ""}`) || b.id.localeCompare(a.id);

/** Fotos (fuera de la papelera) agrupadas por mes, la más nueva primero. */
export function porMes<F extends Foto>(fotos: F[]): [string, F[]][] {
  const m = new Map<string, F[]>();
  for (const f of [...fotos].filter((x) => !x.papelera).sort(orden)) m.set(f.fecha.slice(0, 7), [...(m.get(f.fecha.slice(0, 7)) ?? []), f]);
  return [...m.entries()];
}

export const ordenar = <F extends Foto>(fotos: F[]) => [...fotos].sort(orden);

export function deAlbum<F extends Foto>(fotos: F[], album: string): F[] {
  return ordenar(fotos.filter((f) => !f.papelera && f.albumes.includes(album)));
}

export function diasEnPapelera(f: Foto, ahora: Date): number {
  return f.papelera ? Math.floor((ahora.getTime() - new Date(f.papelera).getTime()) / 86_400_000) : 0;
}

export function extension(f: Pick<Foto, "tipo" | "nombre">): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(f.nombre);
  if (m) return m[1]!.toLowerCase();
  if (f.tipo === "image/png") return "png";
  if (f.tipo === "image/heic" || f.tipo === "image/heif") return "heic";
  if (f.tipo === "image/webp") return "webp";
  return "jpg";
}

/** Nombre dentro del ZIP: «2026-11-07 18.30 (abc123).jpg». */
export const nombreEnZip = (f: Foto) => `${f.fecha}${f.hora ? ` ${f.hora.replace(":", ".")}` : ""} (${f.id.slice(0, 6)}).${extension(f)}`;

export function formatoBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(".", ",")} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}
