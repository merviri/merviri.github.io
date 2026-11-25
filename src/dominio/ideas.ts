import { mismoDiaEnAnio, type Fecha } from "./fechas";
import type { Clima, Coste, Dificultad, Duracion, Momento, Sitio } from "./planes";
import type { Zona } from "./zona";

/**
 * Catálogo de ideas para «Descubrir»: aquí, las que valen en cualquier sitio;
 * las de vuestra ciudad y alrededores están en `zona.json` (repositorio
 * privado), igual que las fechas especiales de la zona. Las fechas son
 * aproximadas y conviene confirmarlas cada año.
 */
export interface Idea {
  id: string;
  titulo: string;
  duracion: Duracion;
  coste: Coste;
  clima: Clima;
  dificultad: Dificultad;
  sitio: Sitio;
  momentos?: Momento[];
  meses?: number[];
  /** Días de antelación para reservar. */
  reserva?: number;
  etiquetas: string[];
  notas?: string;
}

const i = (id: string, titulo: string, duracion: Duracion, coste: Coste, clima: Clima, sitio: Sitio, etiquetas: string[], extra: Partial<Idea> = {}): Idea =>
  ({ id: `c-${id}`, titulo, duracion, coste, clima, dificultad: "facil", sitio, etiquetas, ...extra });

export const CATALOGO: Idea[] = [
  // En casa
  i("juegos", "Noche de juegos de mesa", "rato", "gratis", "da-igual", "casa", ["casa", "juegos"], { momentos: ["noche"] }),
  i("pais", "Cocinar un plato de un país nuevo", "rato", "bajo", "da-igual", "casa", ["casa", "cocina"]),
  i("pizza", "Hacer pizza casera desde la masa", "rato", "bajo", "da-igual", "casa", ["casa", "cocina"]),
  i("cata-casa", "Cata de vinos y quesos en casa", "rato", "medio", "da-igual", "casa", ["casa", "gastronomía"], { momentos: ["noche"] }),
  i("maraton", "Maratón de pelis de una saga", "media", "gratis", "da-igual", "casa", ["casa", "cine"]),
  i("spa-casa", "Tarde de spa en casa", "rato", "bajo", "da-igual", "casa", ["casa", "relax"]),
  i("puzle", "Montar un puzle grande", "media", "bajo", "da-igual", "casa", ["casa", "juegos"]),
  i("karaoke", "Noche de karaoke", "rato", "gratis", "da-igual", "casa", ["casa", "música"], { momentos: ["noche"] }),
  i("pintar", "Pintar juntas (acuarela o lienzo)", "rato", "bajo", "da-igual", "casa", ["casa", "manualidades"]),
  i("hornear", "Hornear un bizcocho o galletas", "rato", "bajo", "da-igual", "casa", ["casa", "cocina"]),
  i("album", "Hacer un álbum con las fotos del año", "media", "bajo", "da-igual", "casa", ["casa", "recuerdos"]),
  i("picnic-salon", "Picnic en el salón con mantita", "rato", "bajo", "da-igual", "casa", ["casa", "romántico"], { momentos: ["noche"] }),
  i("pinchos", "Ruta de pinchos por el centro", "rato", "medio", "da-igual", "ciudad", ["gastronomía", "salir"], { momentos: ["tarde", "noche"] }),
  i("vo", "Cine en versión original", "rato", "bajo", "da-igual", "ciudad", ["cine"], { momentos: ["tarde", "noche"] }),
  i("escape", "Un escape room", "rato", "medio", "da-igual", "ciudad", ["juegos", "salir"]),
  i("ceramica", "Taller de cerámica para dos", "rato", "medio", "da-igual", "ciudad", ["manualidades", "taller"]),
  i("brunch", "Brunch sin prisas un domingo", "rato", "medio", "da-igual", "ciudad", ["gastronomía"], { momentos: ["manana"] }),
  i("picnic", "Picnic en el campo", "media", "bajo", "sol", "cerca", ["naturaleza", "romántico"]),
  i("senderismo", "Ruta de senderismo fácil", "media", "gratis", "sin-lluvia", "cerca", ["naturaleza", "deporte"]),
  i("estrellas", "Ver las estrellas lejos de las luces", "rato", "gratis", "sin-lluvia", "cerca", ["naturaleza", "romántico"], { momentos: ["noche"] }),
  i("kayak", "Kayak en un río o embalse", "media", "medio", "sol", "lejos", ["deporte", "agua"], { dificultad: "media", meses: [5, 6, 7, 8, 9] }),
  i("termas", "Un día de balneario o termas", "dia", "alto", "da-igual", "lejos", ["relax"], { reserva: 7 }),
  i("casa-rural", "Fin de semana en una casa rural", "finde", "alto", "da-igual", "lejos", ["escapada", "relax"], { dificultad: "media", reserva: 21 }),
  i("hayedo", "Hayedo en otoño", "dia", "bajo", "sin-lluvia", "lejos", ["naturaleza", "otoño"], { meses: [10, 11] }),
  i("nieve", "Un día en la nieve", "dia", "medio", "frio", "lejos", ["nieve", "deporte"], { meses: [12, 1, 2, 3], dificultad: "media" }),
  i("patinaje", "Patinar sobre hielo", "rato", "bajo", "da-igual", "ciudad", ["navidad", "deporte"], { meses: [12, 1] }),
];

/** Ideas generales y las de vuestra zona. */
export const catalogoDe = (zona: Zona | null): Idea[] => [...CATALOGO, ...(zona?.ideas ?? [])];

/** Antelación de reserva que traen algunas ideas del catálogo. */
export const reservaDe = (idea: Idea) => idea.reserva ?? 0;

export interface FechaEspecial {
  id: string;
  titulo: string;
  /** Mes y días aproximados (cada año), o fecha fija. */
  mes?: number;
  dias?: [number, number];
  fija?: Fecha;
  notas: string;
  sitio: Sitio;
  clima: Clima;
  duracion: Duracion;
}

export const FECHAS_ESPECIALES: FechaEspecial[] = [
  { id: "cuadrantidas", titulo: "Lluvia de estrellas: Cuadrántidas", mes: 1, dias: [3, 4], notas: "Mejor de madrugada y lejos de las luces.", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
  { id: "valentin", titulo: "San Valentín", mes: 2, dias: [14, 14], notas: "Reservad pronto si es para cenar fuera.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "libro", titulo: "Día del Libro", mes: 4, dias: [23, 23], notas: "Feria y descuentos en librerías.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "museos", titulo: "Día y Noche de los Museos", mes: 5, dias: [16, 18], notas: "El 18 de mayo es el Día Internacional de los Museos; muchos abren gratis o de noche.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "sanjuan", titulo: "Noche de San Juan", mes: 6, dias: [23, 23], notas: "Hogueras junto al río.", sitio: "ciudad", clima: "sin-lluvia", duracion: "rato" },
  { id: "eclipse-2027", titulo: "Eclipse total de Sol (sur de España)", fija: "2027-08-02", notas: "Total en el extremo sur de la península; hay que planear el viaje con mucha antelación.", sitio: "lejos", clima: "sol", duracion: "viaje" },
  { id: "perseidas", titulo: "Lluvia de estrellas: Perseidas", mes: 8, dias: [11, 13], notas: "La más famosa del año. Mejor de madrugada y lejos de las luces.", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
  { id: "orionidas", titulo: "Lluvia de estrellas: Oriónidas", mes: 10, dias: [20, 22], notas: "Mejor de madrugada.", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
  { id: "navidad", titulo: "Luces y mercadillos de Navidad", mes: 12, dias: [1, 30], notas: "Paseo por el centro iluminado y los puestos navideños.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "geminidas", titulo: "Lluvia de estrellas: Gemínidas", mes: 12, dias: [13, 14], notas: "Una de las mejores del año; hace frío: ¡mantas!", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
];

/** Fechas especiales generales y las de vuestra zona. */
export const fechasEspecialesDe = (zona: Zona | null): FechaEspecial[] => [...FECHAS_ESPECIALES, ...(zona?.fechasEspeciales ?? [])];

/** Próxima vez (desde hoy) de una fecha especial: [desde, hasta], o null si ya pasó (las fijas). */
export function proximaVez(f: FechaEspecial, hoyF: Fecha): [Fecha, Fecha] | null {
  if (f.fija) return f.fija >= hoyF ? [f.fija, f.fija] : null;
  const anio = +hoyF.slice(0, 4);
  for (const a of [anio, anio + 1]) {
    const base = `${a}-${String(f.mes).padStart(2, "0")}-01`;
    const desde = mismoDiaEnAnio(`${base.slice(0, 8)}${String(f.dias![0]).padStart(2, "0")}`, a);
    const hasta = mismoDiaEnAnio(`${base.slice(0, 8)}${String(f.dias![1]).padStart(2, "0")}`, a);
    if (hasta >= hoyF) return [desde, hasta];
  }
  return null;
}
