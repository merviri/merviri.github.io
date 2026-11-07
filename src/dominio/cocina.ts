import { esFecha, type Fecha } from "./fechas";
import { separarCantidad } from "./listas";
import type { IdPersona } from "./pareja";

/**
 * Recetas, menú semanal y lista de la compra.
 *  - Recetas en `datos/recetas.json`.
 *  - Menú en `datos/menu/<año>.json`: un registro por día y comida
 *    («2026-11-09:cena»), así cada una puede tocar un día sin pisar otro.
 */
export const RUTA_RECETAS = "datos/recetas.json";
export const rutaMenu = (fecha: Fecha) => `datos/menu/${fecha.slice(0, 4)}.json`;

export type Seccion = "fruta" | "pan" | "carne" | "lacteos" | "despensa" | "congelados" | "bebidas" | "hogar" | "otros";
export const SECCIONES: { id: Seccion; nombre: string; emoji: string }[] = [
  { id: "fruta", nombre: "Frutas y verduras", emoji: "🥬" },
  { id: "pan", nombre: "Panadería", emoji: "🥖" },
  { id: "carne", nombre: "Carne y pescado", emoji: "🥩" },
  { id: "lacteos", nombre: "Lácteos y huevos", emoji: "🧀" },
  { id: "despensa", nombre: "Despensa", emoji: "🥫" },
  { id: "congelados", nombre: "Congelados", emoji: "🧊" },
  { id: "bebidas", nombre: "Bebidas", emoji: "🧃" },
  { id: "hogar", nombre: "Hogar y limpieza", emoji: "🧽" },
  { id: "otros", nombre: "Otros", emoji: "🛒" },
];

const PALABRAS: [Seccion, string[]][] = [
  ["congelados", ["congelad", "helado"]],
  ["fruta", ["tomate", "lechuga", "cebolla", "ajo", "patata", "zanahoria", "pimiento", "calabacin", "berenjena", "manzana", "platano", "naranja",
    "limon", "lima", "fresa", "aguacate", "espinaca", "brocoli", "coliflor", "champinon", "seta", "puerro", "pepino", "perejil", "cilantro",
    "albahaca", "fruta", "verdura", "uva", "pera", "melon", "sandia", "kiwi", "calabaza", "judia verde", "judias verdes", "alcachofa", "rucula",
    "canonigo", "apio", "jengibre", "mango", "pina", "melocoton", "cereza", "esparrago", "boniato", "hierbabuena", "menta", "cebollino", "remolacha"]],
  ["pan", ["pan", "baguette", "barra", "tortita", "wrap", "bollo", "croissant", "masa de pizza", "hojaldre", "brioche"]],
  ["carne", ["pollo", "ternera", "cerdo", "carne", "jamon", "chorizo", "bacon", "beicon", "salchicha", "pavo", "cordero", "pescado", "salmon",
    "merluza", "gamba", "langostino", "mejillon", "bacalao", "sepia", "calamar", "hamburguesa", "lomo", "costilla", "solomillo", "pechuga",
    "muslo", "panceta", "lubina", "dorada", "atun fresco", "chistorra", "morcilla", "secreto", "picada"]],
  ["lacteos", ["leche", "huevo", "queso", "yogur", "nata", "mantequilla", "requeson", "mozzarella", "parmesano", "kefir", "burrata"]],
  ["bebidas", ["agua", "vino", "cerveza", "zumo", "refresco", "cava", "tonica", "kombucha"]],
  ["hogar", ["papel", "detergente", "jabon", "lavavajillas", "bolsa", "servilleta", "suavizante", "lejia", "estropajo", "pañuelo", "panuelo", "film", "aluminio"]],
  ["despensa", ["arroz", "pasta", "macarron", "espagueti", "fideo", "harina", "azucar", "sal", "aceite", "vinagre", "lenteja", "garbanzo", "alubia",
    "tomate frito", "tomate triturado", "atun", "especia", "pimenton", "comino", "oregano", "caldo", "levadura", "chocolate", "cacao", "galleta",
    "cereal", "miel", "mermelada", "cafe", "te ", "salsa", "mayonesa", "ketchup", "mostaza", "conserva", "quinoa", "cuscus", "avena", "almendra",
    "nuez", "pimienta", "curry", "soja", "leche de coco", "pan rallado", "maicena", "lasana", "canelon", "tortilla", "nachos", "pipas", "aceituna"]],
];

const normal = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Sección del súper adivinada por el nombre (las frases más concretas ganan: «tomate frito» es despensa). */
export function seccionDe(nombre: string): Seccion {
  const n = ` ${normal(nombre)} `;
  let mejor: { s: Seccion; largo: number } | null = null;
  for (const [s, palabras] of PALABRAS) {
    for (const p of palabras) {
      if (n.includes(p) && (!mejor || p.length > mejor.largo)) mejor = { s, largo: p.length };
    }
  }
  return mejor?.s ?? "otros";
}

export interface Ingrediente {
  nombre: string;
  cantidad: string | null;
}

export interface Receta {
  id: string;
  titulo: string;
  raciones: number | null;
  minutos: number | null;
  ingredientes: Ingrediente[];
  pasos: string;
  enlace: string | null;
  etiquetas: string[];
}

/** Una línea por ingrediente: «200 g de arroz», «2 huevos», «sal». */
export function leerIngredientes(texto: string): Ingrediente[] {
  return texto.split(/\r?\n/).map((l) => l.replace(/^[-•*·\s]+/, "").trim()).filter(Boolean).slice(0, 60).map((l) => {
    const { texto: nombre, cantidad } = separarCantidad(l);
    return { nombre, cantidad };
  });
}

export const ingredientesATexto = (ings: Ingrediente[]) => ings.map((i) => (i.cantidad ? `${i.cantidad} ${i.nombre}` : i.nombre)).join("\n");

export function problemaReceta(r: Receta): string | null {
  if (!r.titulo.trim()) return "Ponle un nombre a la receta.";
  if (r.titulo.length > 100) return "El nombre puede tener como mucho 100 caracteres.";
  if (r.enlace && !/^https?:\/\/\S+$/i.test(r.enlace)) return "El enlace tiene que empezar por http:// o https://.";
  if (r.raciones !== null && (!Number.isInteger(r.raciones) || r.raciones < 1 || r.raciones > 50)) return "Las raciones no son válidas.";
  if (r.minutos !== null && (!Number.isInteger(r.minutos) || r.minutos < 1 || r.minutos > 1440)) return "El tiempo no es válido.";
  return null;
}

export type Comida = "comida" | "cena";
export const COMIDAS: { id: Comida; nombre: string; emoji: string }[] = [
  { id: "comida", nombre: "Comida", emoji: "🍽️" },
  { id: "cena", nombre: "Cena", emoji: "🌙" },
];

export interface PlatoMenu {
  /** «AAAA-MM-DD:comida» o «AAAA-MM-DD:cena». */
  id: string;
  fecha: Fecha;
  comida: Comida;
  receta: string | null;
  /** Texto libre si no es una receta («Sobras», «Cenamos fuera»). */
  texto: string | null;
  cocina: IdPersona | "ambas" | null;
}

export const idPlato = (fecha: Fecha, comida: Comida) => `${fecha}:${comida}`;

export function problemaPlato(p: PlatoMenu): string | null {
  if (!esFecha(p.fecha)) return "Fecha no válida.";
  if (!p.receta && !(p.texto ?? "").trim()) return "Elige una receta o escribe qué vais a comer.";
  return null;
}

/** Última vez que se puso cada receta en el menú (para sugerir lo que hace tiempo que no hacéis). */
export function ultimaVez(platos: PlatoMenu[]): Map<string, Fecha> {
  const m = new Map<string, Fecha>();
  for (const p of platos) if (p.receta && (!m.has(p.receta) || p.fecha > m.get(p.receta)!)) m.set(p.receta, p.fecha);
  return m;
}

export interface ParaComprar {
  nombre: string;
  cantidades: string[];
  seccion: Seccion;
  /** Para qué platos. */
  para: string[];
}

/** Junta los ingredientes de varias recetas (sin repetir) y los ordena por sección del súper. */
export function listaDeCompra(platos: { receta: Receta; dia: string }[], yaEnLaLista: string[]): ParaComprar[] {
  const tengo = new Set(yaEnLaLista.map(normal));
  const m = new Map<string, ParaComprar>();
  for (const { receta, dia } of platos) {
    for (const ing of receta.ingredientes) {
      const k = normal(ing.nombre);
      if (!k || tengo.has(k)) continue;
      const e = m.get(k) ?? { nombre: ing.nombre, cantidades: [], seccion: seccionDe(ing.nombre), para: [] };
      if (ing.cantidad) e.cantidades.push(ing.cantidad);
      const etiqueta = `${receta.titulo} (${dia})`;
      if (!e.para.includes(etiqueta)) e.para.push(etiqueta);
      m.set(k, e);
    }
  }
  const orden = (s: Seccion) => SECCIONES.findIndex((x) => x.id === s);
  return [...m.values()].sort((a, b) => orden(a.seccion) - orden(b.seccion) || a.nombre.localeCompare(b.nombre, "es"));
}
