import type { Album, Foto } from "./album";
import type { Fecha } from "./fechas";
import type { Lugar, Plan } from "./planes";

/**
 * Mapa de «dónde hemos estado»: los álbumes con lugar (o cuyo plan lo tiene)
 * y los planes hechos o ya planificados con un sitio. Lo que está en el mismo
 * sitio sale junto en un solo punto.
 */
export interface CosaEnMapa {
  tipo: "album" | "plan";
  id: string;
  titulo: string;
  emoji: string;
  href: string;
  fotos: number;
  /** Primer día (fotos, o fecha del plan). */
  desde: Fecha | null;
  /** Plan aún por hacer. */
  futuro: boolean;
}

export interface PuntoMapa {
  clave: string;
  lat: number;
  lon: number;
  nombre: string;
  cosas: CosaEnMapa[];
}

export const conCoordenadas = (l: Lugar | null | undefined): l is Lugar & { lat: number; lon: number } =>
  !!l && typeof l.lat === "number" && typeof l.lon === "number" && Number.isFinite(l.lat) && Number.isFinite(l.lon) &&
  Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180;

/** Mismo sitio = a menos de ~100 m. */
const claveDe = (l: { lat: number; lon: number }) => `${l.lat.toFixed(3)},${l.lon.toFixed(3)}`;

export function puntosDelMapa(d: { albumes: Album[]; planes: Plan[]; fotos: Foto[] }): PuntoMapa[] {
  const puntos = new Map<string, PuntoMapa>();
  const poner = (l: Lugar & { lat: number; lon: number }, cosa: CosaEnMapa) => {
    const clave = claveDe(l);
    const p = puntos.get(clave) ?? { clave, lat: l.lat, lon: l.lon, nombre: l.nombre, cosas: [] };
    p.cosas.push(cosa);
    puntos.set(clave, p);
  };
  const visibles = d.fotos.filter((f) => !f.papelera);
  const planesConAlbum = new Set<string>();
  for (const a of d.albumes) {
    const plan = a.plan ? d.planes.find((p) => p.id === a.plan) : undefined;
    const lugar = conCoordenadas(a.lugar) ? a.lugar : conCoordenadas(plan?.lugar) ? plan!.lugar : null;
    if (!lugar) continue;
    const dias = visibles.filter((f) => f.albumes.includes(a.id)).map((f) => f.fecha).sort();
    poner(lugar as Lugar & { lat: number; lon: number }, {
      tipo: "album", id: a.id, titulo: a.nombre, emoji: a.emoji, href: `#album/${a.id}`, fotos: dias.length,
      desde: dias[0] ?? plan?.hechoEn ?? plan?.fecha ?? null, futuro: false,
    });
    if (a.plan) planesConAlbum.add(a.plan);
  }
  for (const p of d.planes) {
    if (planesConAlbum.has(p.id) || !conCoordenadas(p.lugar)) continue;
    if (p.estado !== "hecho" && p.estado !== "planificado") continue;
    poner(p.lugar, {
      tipo: "plan", id: p.id, titulo: p.titulo, emoji: "✨", href: `#plan/${p.id}`, fotos: 0,
      desde: p.hechoEn ?? p.fecha ?? null, futuro: p.estado === "planificado",
    });
  }
  return [...puntos.values()]
    .map((p) => ({ ...p, cosas: p.cosas.sort((a, b) => (b.desde ?? "").localeCompare(a.desde ?? "") || a.titulo.localeCompare(b.titulo, "es")) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
