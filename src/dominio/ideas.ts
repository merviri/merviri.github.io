import { mismoDiaEnAnio, type Fecha } from "./fechas";
import type { Clima, Coste, Dificultad, Duracion, Momento, Sitio } from "./planes";

/**
 * Catálogo de ideas para «Descubrir» (no salen de internet: van con la app).
 * Algunas son de Valladolid y alrededores; las fechas especiales son
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
  // En Valladolid
  i("campo-grande", "Paseo por el Campo Grande", "rato", "gratis", "sin-lluvia", "ciudad", ["paseo", "naturaleza"]),
  i("moreras", "Ver el atardecer en Las Moreras, junto al Pisuerga", "rato", "gratis", "sin-lluvia", "ciudad", ["paseo", "atardecer"], { momentos: ["tarde"] }),
  i("escultura", "Museo Nacional de Escultura", "rato", "bajo", "da-igual", "ciudad", ["museo", "cultura"], { momentos: ["manana", "tarde"] }),
  i("herreriano", "Museo Patio Herreriano (arte contemporáneo)", "rato", "bajo", "da-igual", "ciudad", ["museo", "cultura"], { momentos: ["manana", "tarde"] }),
  i("ciencia", "Museo de la Ciencia y su planetario", "media", "bajo", "da-igual", "ciudad", ["museo", "ciencia"]),
  i("pinchos", "Ruta de pinchos por el centro", "rato", "medio", "da-igual", "ciudad", ["gastronomía", "salir"], { momentos: ["tarde", "noche"] }),
  i("val", "Comer en el Mercado del Val", "rato", "medio", "da-igual", "ciudad", ["gastronomía"]),
  i("calderon", "Una obra en el Teatro Calderón", "rato", "medio", "da-igual", "ciudad", ["teatro", "cultura"], { momentos: ["noche"], reserva: 7 }),
  i("delibes", "Concierto en el Auditorio Miguel Delibes", "rato", "medio", "da-igual", "ciudad", ["música", "cultura"], { momentos: ["noche"] }),
  i("vo", "Cine en versión original", "rato", "bajo", "da-igual", "ciudad", ["cine"], { momentos: ["tarde", "noche"] }),
  i("bici-pisuerga", "Bici por la ribera del Pisuerga", "rato", "gratis", "sin-lluvia", "ciudad", ["deporte", "naturaleza"]),
  i("escape", "Un escape room", "rato", "medio", "da-igual", "ciudad", ["juegos", "salir"]),
  i("ceramica", "Taller de cerámica para dos", "rato", "medio", "da-igual", "ciudad", ["manualidades", "taller"]),
  i("brunch", "Brunch sin prisas un domingo", "rato", "medio", "da-igual", "ciudad", ["gastronomía"], { momentos: ["manana"] }),
  // Cerca (≤ 1 h y pico)
  i("penafiel", "Peñafiel: castillo y Museo del Vino", "dia", "medio", "sin-lluvia", "cerca", ["excursión", "vino", "castillo"]),
  i("bodega", "Visita y cata en una bodega de la Ribera del Duero", "media", "medio", "da-igual", "cerca", ["vino", "excursión"], { reserva: 7 }),
  i("uruena", "Urueña, la villa del libro", "media", "bajo", "sin-lluvia", "cerca", ["excursión", "libros", "pueblos"]),
  i("rioseco", "Medina de Rioseco y el Canal de Castilla", "dia", "bajo", "sin-lluvia", "cerca", ["excursión", "naturaleza", "pueblos"]),
  i("tordesillas", "Tordesillas: casco histórico y el Duero", "media", "bajo", "sin-lluvia", "cerca", ["excursión", "pueblos"]),
  i("simancas", "Simancas y su castillo", "media", "gratis", "sin-lluvia", "cerca", ["excursión", "castillo"]),
  i("mota", "Castillo de la Mota en Medina del Campo", "media", "bajo", "da-igual", "cerca", ["castillo", "excursión"]),
  i("coca", "Castillo de Coca", "media", "bajo", "sin-lluvia", "cerca", ["castillo", "excursión"]),
  i("palencia", "Palencia y el Cristo del Otero", "media", "bajo", "sin-lluvia", "cerca", ["excursión", "ciudad"]),
  i("picnic", "Picnic en el campo", "media", "bajo", "sol", "cerca", ["naturaleza", "romántico"]),
  i("senderismo", "Ruta de senderismo fácil", "media", "gratis", "sin-lluvia", "cerca", ["naturaleza", "deporte"]),
  i("estrellas", "Ver las estrellas lejos de las luces", "rato", "gratis", "sin-lluvia", "cerca", ["naturaleza", "romántico"], { momentos: ["noche"] }),
  // Más lejos
  i("segovia", "Segovia: acueducto, catedral y alcázar", "dia", "medio", "sin-lluvia", "lejos", ["excursión", "ciudad"]),
  i("salamanca", "Salamanca y su Plaza Mayor", "dia", "medio", "da-igual", "lejos", ["excursión", "ciudad"]),
  i("avila", "Paseo por la muralla de Ávila", "dia", "medio", "sin-lluvia", "lejos", ["excursión", "ciudad"]),
  i("burgos", "Burgos y su catedral", "dia", "medio", "da-igual", "lejos", ["excursión", "ciudad"]),
  i("duraton", "Hoces del Duratón y Sepúlveda", "dia", "medio", "sol", "lejos", ["naturaleza", "excursión"], { dificultad: "media" }),
  i("kayak", "Kayak en un río o embalse", "media", "medio", "sol", "lejos", ["deporte", "agua"], { dificultad: "media", meses: [5, 6, 7, 8, 9] }),
  i("termas", "Un día de balneario o termas", "dia", "alto", "da-igual", "lejos", ["relax"], { reserva: 7 }),
  i("casa-rural", "Fin de semana en una casa rural", "finde", "alto", "da-igual", "lejos", ["escapada", "relax"], { dificultad: "media", reserva: 21 }),
  i("lisboa", "Escapada a Lisboa", "viaje", "alto", "da-igual", "lejos", ["viaje", "ciudad"], { dificultad: "dificil", reserva: 30 }),
  i("oporto", "Escapada a Oporto", "viaje", "alto", "da-igual", "lejos", ["viaje", "ciudad"], { dificultad: "dificil", reserva: 30 }),
  i("picos", "Picos de Europa", "viaje", "alto", "sin-lluvia", "lejos", ["viaje", "naturaleza", "montaña"], { dificultad: "dificil", meses: [5, 6, 7, 8, 9, 10], reserva: 30 }),
  i("playa", "Unos días de playa en el norte", "viaje", "alto", "sol", "lejos", ["viaje", "playa"], { dificultad: "dificil", meses: [6, 7, 8, 9], reserva: 30 }),
  i("musical", "Un musical en Madrid", "dia", "alto", "da-igual", "lejos", ["teatro", "música", "viaje"], { reserva: 30, momentos: ["tarde", "noche"] }),
  i("hayedo", "Hayedo en otoño", "dia", "bajo", "sin-lluvia", "lejos", ["naturaleza", "otoño"], { meses: [10, 11] }),
  i("nieve", "Un día en la nieve", "dia", "medio", "frio", "lejos", ["nieve", "deporte"], { meses: [12, 1, 2, 3], dificultad: "media" }),
  i("patinaje", "Patinar sobre hielo", "rato", "bajo", "da-igual", "ciudad", ["navidad", "deporte"], { meses: [12, 1] }),
];

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
  { id: "jerte", titulo: "Cerezos en flor en el Valle del Jerte", mes: 3, dias: [25, 31], notas: "Suele ser de finales de marzo a mediados de abril; depende del tiempo de cada año.", sitio: "lejos", clima: "sin-lluvia", duracion: "finde" },
  { id: "libro", titulo: "Día del Libro", mes: 4, dias: [23, 23], notas: "Feria y descuentos en librerías.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "museos", titulo: "Día y Noche de los Museos", mes: 5, dias: [16, 18], notas: "El 18 de mayo es el Día Internacional de los Museos; muchos abren gratis o de noche.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "tac", titulo: "TAC: teatro de calle en Valladolid", mes: 5, dias: [25, 31], notas: "Festival de artes de calle; las fechas cambian cada año (finales de mayo o junio).", sitio: "ciudad", clima: "sin-lluvia", duracion: "rato" },
  { id: "sanjuan", titulo: "Noche de San Juan", mes: 6, dias: [23, 23], notas: "Hogueras junto al río.", sitio: "ciudad", clima: "sin-lluvia", duracion: "rato" },
  { id: "eclipse-2027", titulo: "Eclipse total de Sol (sur de España)", fija: "2027-08-02", notas: "Total en el extremo sur de la península; hay que planear el viaje con mucha antelación.", sitio: "lejos", clima: "sol", duracion: "viaje" },
  { id: "perseidas", titulo: "Lluvia de estrellas: Perseidas", mes: 8, dias: [11, 13], notas: "La más famosa del año. Mejor de madrugada y lejos de las luces.", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
  { id: "fiestas", titulo: "Fiestas de Valladolid", mes: 9, dias: [4, 12], notas: "Feria y Fiestas de la Virgen de San Lorenzo, a principios de septiembre.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "vendimia", titulo: "Vendimia en la Ribera del Duero", mes: 9, dias: [15, 30], notas: "Muchas bodegas organizan visitas en septiembre y octubre.", sitio: "cerca", clima: "sin-lluvia", duracion: "dia" },
  { id: "orionidas", titulo: "Lluvia de estrellas: Oriónidas", mes: 10, dias: [20, 22], notas: "Mejor de madrugada.", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
  { id: "seminci", titulo: "Seminci, festival de cine de Valladolid", mes: 10, dias: [20, 31], notas: "Semana Internacional de Cine, a finales de octubre.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "pinchos", titulo: "Concurso de Pinchos de Valladolid", mes: 11, dias: [1, 30], notas: "En noviembre; buen momento para una ruta de pinchos.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "navidad", titulo: "Luces y mercadillos de Navidad", mes: 12, dias: [1, 30], notas: "Paseo por el centro iluminado y los puestos navideños.", sitio: "ciudad", clima: "da-igual", duracion: "rato" },
  { id: "geminidas", titulo: "Lluvia de estrellas: Gemínidas", mes: 12, dias: [13, 14], notas: "Una de las mejores del año; hace frío: ¡mantas!", sitio: "cerca", clima: "sin-lluvia", duracion: "rato" },
];

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
