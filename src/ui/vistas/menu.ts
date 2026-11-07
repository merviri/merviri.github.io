import type { Merviri } from "../../app/app";
import { inicioSemana, LETRAS_DIA } from "../../dominio/calendario";
import {
  COMIDAS,
  idPlato,
  ingredientesATexto,
  leerIngredientes,
  listaDeCompra,
  problemaPlato,
  problemaReceta,
  RUTA_RECETAS,
  rutaMenu,
  SECCIONES,
  ultimaVez,
  type Comida,
  type PlatoMenu,
  type Receta,
} from "../../dominio/cocina";
import { diasEntre, fechaCorta, haceCuanto, hoy, sumarDias, type Fecha } from "../../dominio/fechas";
import { RUTA_LISTAS, rutaElementos, type Elemento, type Lista } from "../../dominio/listas";
import { otraPersona } from "../../dominio/pareja";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { campo, confirmarPeligro, dialogoFormulario, h, tostada } from "../dom";
import { texto, volver } from "./comunes";
import { diaLargo } from "./evento";

let lunes: Fecha = inicioSemana(hoy());
let buscar = "";

export const recetas = (app: Merviri) => app.lista<Receta>(RUTA_RECETAS).sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));

function platos(app: Merviri, desde: Fecha, hasta: Fecha): Registro<PlatoMenu>[] {
  const anios = new Set([desde.slice(0, 4), hasta.slice(0, 4)]);
  return [...anios].flatMap((a) => app.lista<PlatoMenu>(rutaMenu(`${a}-01-01`))).filter((p) => p.fecha >= desde && p.fecha <= hasta);
}

function todosLosPlatos(app: Merviri): PlatoMenu[] {
  return app.motor?.rutasCon("datos/menu/").flatMap((r) => app.lista<PlatoMenu>(r)) ?? [];
}

export function platoDeHoy(app: Merviri): { comida: string | null; cena: string | null } | null {
  const ps = platos(app, hoy(), hoy());
  if (!ps.length) return null;
  const rs = recetas(app);
  const t = (c: Comida) => {
    const p = ps.find((x) => x.comida === c);
    return p ? (p.receta ? rs.find((r) => r.id === p.receta)?.titulo ?? "Receta" : p.texto) : null;
  };
  return { comida: t("comida"), cena: t("cena") };
}

// ---------------------------------------------------------------------------
// Menú semanal
// ---------------------------------------------------------------------------

export function vistaMenu(app: Merviri): HTMLElement {
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const ps = platos(app, dias[0]!, dias[6]!);
  const rs = recetas(app);
  const pareja = app.pareja();
  const hoyF = hoy();

  const slot = (d: Fecha, c: Comida) => {
    const p = ps.find((x) => x.fecha === d && x.comida === c);
    const titulo = p ? (p.receta ? rs.find((r) => r.id === p.receta)?.titulo ?? "Receta borrada" : p.texto) : null;
    const cocina = p?.cocina ? (p.cocina === "ambas" ? "las dos" : pareja.personas[p.cocina].nombre) : null;
    return h("button", { type: "button", class: `plato ${p ? "lleno" : ""}`, onclick: () => void editarPlato(app, d, c, p ?? null) },
      h("small", {}, COMIDAS.find((x) => x.id === c)!.emoji),
      h("span", {}, titulo ?? "＋"),
      cocina ? h("small", { class: "secundario" }, `cocina ${cocina}`) : null);
  };

  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Menú"),
      h("a", { class: "boton", href: "#recetas" }, `📖 Recetas (${rs.length})`)),
    h("div", { class: "navegar-fecha" },
      h("button", { type: "button", class: "boton-icono", "aria-label": "Semana anterior", onclick: () => { lunes = sumarDias(lunes, -7); app.refrescar(); } }, "‹"),
      h("h2", {}, `Semana del ${fechaCorta(lunes)}`),
      h("button", { type: "button", class: "boton-icono", "aria-label": "Semana siguiente", onclick: () => { lunes = sumarDias(lunes, 7); app.refrescar(); } }, "›"),
      h("button", { type: "button", class: "boton boton-pequeno", onclick: () => { lunes = inicioSemana(hoy()); app.refrescar(); } }, "Hoy")),
    h("ul", { class: "semana-menu" }, dias.map((d, i) => h("li", { class: d === hoyF ? "hoy" : "" },
      h("span", { class: "dia-menu" }, h("b", {}, LETRAS_DIA[i]!), h("small", {}, String(+d.slice(8, 10)))),
      slot(d, "comida"), slot(d, "cena")))),
    h("div", { class: "botones arriba" },
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void aLaCompra(app, dias) }, "🛒 A la lista de la compra")),
    !rs.length ? h("p", { class: "secundario arriba" }, "Apuntad vuestras recetas en 📖 Recetas y podréis ponerlas en el menú y pasar sus ingredientes a la compra.") : null,
  );
}

async function editarPlato(app: Merviri, d: Fecha, c: Comida, p: Registro<PlatoMenu> | null) {
  const rs = recetas(app);
  const ult = ultimaVez(todosLosPlatos(app));
  const yo = app.persona;
  const otra = otraPersona(yo);
  const pareja = app.pareja();
  // Primero lo que hace más tiempo que no hacéis.
  const ordenadas = [...rs].sort((a, b) => (ult.get(a.id) ?? "0000").localeCompare(ult.get(b.id) ?? "0000") || a.titulo.localeCompare(b.titulo, "es"));
  const receta = h("select", { name: "receta" },
    h("option", { value: "" }, "— Otra cosa (escríbela abajo) —"),
    ordenadas.map((r) => h("option", { value: r.id, selected: p?.receta === r.id },
      `${r.titulo}${ult.get(r.id) ? ` · hace ${Math.max(0, diasEntre(ult.get(r.id)!, hoy()))} días` : " · nunca"}`)));
  const libre = h("input", { name: "texto", value: p?.texto ?? "", maxlength: 80, placeholder: "Sobras, cenamos fuera, pizza…" });
  const filaLibre = campo("Qué", libre);
  const actualizar = () => { filaLibre.hidden = receta.value !== ""; };
  receta.addEventListener("change", actualizar);
  actualizar();
  let quitar = false;
  await dialogoFormulario(`${COMIDAS.find((x) => x.id === c)!.nombre} · ${diaLargo(d)}`, [
    rs.length ? campo("Receta", receta) : null,
    filaLibre,
    campo("¿Quién cocina?", h("select", { name: "cocina" },
      h("option", { value: "", selected: !p?.cocina }, "Sin decidir"),
      h("option", { value: yo, selected: p?.cocina === yo }, `${pareja.personas[yo].nombre} (yo)`),
      h("option", { value: otra, selected: p?.cocina === otra }, pareja.personas[otra].nombre),
      h("option", { value: "ambas", selected: p?.cocina === "ambas" }, "Las dos"))),
    p ? h("button", { type: "button", class: "enlace-boton peligro", onclick: (ev: Event) => { quitar = true; (ev.target as HTMLElement).closest("form")!.requestSubmit(); } }, "Quitar del menú") : null,
  ], "Guardar", async (f) => {
    if (p && quitar) { await app.borrar(rutaMenu(d), p.id); return; }
    const r = texto(f, "receta");
    const cocina = texto(f, "cocina");
    const plato: PlatoMenu = {
      id: idPlato(d, c), fecha: d, comida: c, receta: r || null, texto: r ? null : texto(f, "texto").trim() || null,
      cocina: cocina === "p1" || cocina === "p2" || cocina === "ambas" ? cocina : null,
    };
    const prob = problemaPlato(plato);
    if (prob) throw new Error(prob);
    await app.guardar<PlatoMenu>(rutaMenu(d), plato);
  });
}

/** Pasa los ingredientes de los platos elegidos a una lista, ordenados por secciones del súper. */
async function aLaCompra(app: Merviri, dias: Fecha[]) {
  const ps = platos(app, dias[0]!, dias[6]!).filter((p) => p.receta && p.fecha >= hoy());
  const rs = recetas(app);
  if (!ps.length) {
    tostada("No hay recetas en el menú de aquí en adelante esta semana.");
    return;
  }
  const listas = app.lista<Lista>(RUTA_LISTAS);
  const compra = listas.find((l) => l.nombre.toLowerCase().includes("compra"));
  await dialogoFormulario("A la lista de la compra", [
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "¿De qué platos?"),
      ps.sort((a, b) => a.id.localeCompare(b.id)).map((p) => h("label", { class: "casilla" },
        h("input", { type: "checkbox", name: "plato", value: p.id, checked: true }),
        h("span", {}, `${diaLargo(p.fecha)} · ${rs.find((r) => r.id === p.receta)?.titulo ?? "?"}`)))),
    campo("A qué lista", h("select", { name: "lista" },
      listas.map((l) => h("option", { value: l.id, selected: l.id === compra?.id }, `${l.emoji} ${l.nombre}`)),
      compra ? null : h("option", { value: "__nueva", selected: true }, "🛒 Compra (nueva)"))),
    h("p", { class: "ayuda" }, "No se repite lo que ya esté pendiente en la lista."),
  ], "Añadir", async (f) => {
    let idLista = texto(f, "lista");
    let lista: Lista | undefined = listas.find((l) => l.id === idLista);
    if (!lista) {
      const nueva: Lista = { id: nuevoId(), nombre: "Compra", emoji: "🛒", orden: Date.now() };
      await app.guardar<Lista>(RUTA_LISTAS, nueva);
      lista = nueva;
      idLista = nueva.id;
    }
    const destino = lista;
    const elegidos = new Set(f.getAll("plato").map(String));
    const ruta = rutaElementos(idLista);
    const pendientes = app.lista<Elemento>(ruta).filter((e) => !e.hecho).map((e) => e.texto);
    const compra = listaDeCompra(ps.filter((p) => elegidos.has(p.id)).map((p) => ({
      receta: rs.find((r) => r.id === p.receta)!, dia: fechaCorta(p.fecha),
    })).filter((x) => x.receta), pendientes);
    const base = -Date.now();
    let i = 0;
    for (const c of compra) {
      const sec = SECCIONES.findIndex((s) => s.id === c.seccion);
      await app.guardar<Elemento>(ruta, {
        id: nuevoId(), texto: c.nombre, cantidad: c.cantidades.join(" + ") || null, nota: `Para: ${c.para.join(", ")}`,
        hecho: false, hechoPor: null, hechoEn: null, orden: base + sec * 1000 + i++,
      });
    }
    tostada(compra.length ? `Añadidas ${compra.length} cosas a ${destino.emoji} ${destino.nombre} ✨` : "Ya estaba todo en la lista.", "info",
      { texto: "Ver", hacer: () => { location.hash = `#lista/${idLista}`; } });
  });
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------

export function vistaRecetas(app: Merviri): HTMLElement {
  const ult = ultimaVez(todosLosPlatos(app));
  const t = buscar.trim().toLowerCase();
  const lista = recetas(app).filter((r) => !t || r.titulo.toLowerCase().includes(t) || r.etiquetas.some((e) => e.toLowerCase().includes(t)) ||
    r.ingredientes.some((i) => i.nombre.toLowerCase().includes(t)));
  const campoBuscar = h("input", { type: "search", name: "buscar-recetas", value: buscar, placeholder: "Buscar por nombre o ingrediente…", "data-refrescable": true, autocomplete: "off", "aria-label": "Buscar recetas" });
  campoBuscar.addEventListener("input", () => { buscar = campoBuscar.value; app.refrescar(); });
  return h("section", {},
    volver("#menu", "Menú"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Recetas"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarReceta(app, null) }, "+ Receta")),
    h("div", { class: "anadir" }, campoBuscar),
    lista.length
      ? h("ul", { class: "tarjetas-lista" }, lista.map((r) => h("li", {}, h("a", { class: "tarjeta-enlace", href: `#receta/${r.id}` },
        h("span", { class: "crece" }, h("b", {}, r.titulo),
          h("small", { class: "secundario" }, [r.minutos ? `⏱️ ${r.minutos} min` : "", r.raciones ? `🍽️ ${r.raciones}` : "",
            ult.get(r.id) ? `hecha hace ${Math.max(0, diasEntre(ult.get(r.id)!, hoy()))} días` : "aún no en el menú"].filter(Boolean).join(" · "))),
        h("span", { class: "flecha", "aria-hidden": "true" }, "›")))))
      : h("p", { class: "secundario" }, t ? "No hay recetas con eso." : "Apuntad las recetas que os gustan: ingredientes y pasos."),
  );
}

export function vistaReceta(app: Merviri, id: string): HTMLElement {
  const r = app.uno<Receta>(RUTA_RECETAS, id);
  if (!r) return h("section", {}, volver("#recetas", "Recetas"), h("p", {}, "Esta receta ya no existe."));
  return h("section", {},
    volver("#recetas", "Recetas"),
    h("h1", {}, r.titulo),
    h("p", { class: "secundario" }, [r.minutos ? `⏱️ ${r.minutos} min` : "", r.raciones ? `🍽️ ${r.raciones} raciones` : "",
      ...r.etiquetas.map((e) => `#${e}`)].filter(Boolean).join(" · "), r.actualizado ? ` · editada ${haceCuanto(r.actualizado)}` : ""),
    r.ingredientes.length ? [h("h2", {}, "Ingredientes"), h("ul", { class: "ingredientes" }, r.ingredientes.map((i) => h("li", {}, i.cantidad ? h("b", {}, `${i.cantidad} `) : null, i.nombre)))] : null,
    r.pasos.trim() ? [h("h2", { class: "arriba" }, "Pasos"), h("p", { class: "notas-evento" }, r.pasos)] : null,
    r.enlace ? h("p", {}, h("a", { href: r.enlace, target: "_blank", rel: "noopener noreferrer" }, "🔗 Ver la receta original")) : null,
    h("div", { class: "botones arriba" },
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void alMenu(app, r) }, "📅 Al menú"),
      h("button", { type: "button", class: "boton", onclick: () => void editarReceta(app, r) }, "Editar"),
      h("button", {
        type: "button", class: "boton boton-peligro",
        onclick: async () => {
          if (!(await confirmarPeligro("Borrar la receta", `Se borra «${r.titulo}» para las dos.`, "Borrar"))) return;
          await app.borrar(RUTA_RECETAS, r.id);
          location.hash = "#recetas";
        },
      }, "Borrar")),
  );
}

async function alMenu(app: Merviri, r: Receta) {
  await dialogoFormulario(`«${r.titulo}» al menú`, [
    campo("Día", h("input", { type: "date", name: "dia", value: hoy(), required: true })),
    campo("Comida o cena", h("select", { name: "comida" }, COMIDAS.map((c) => h("option", { value: c.id, selected: c.id === "cena" }, c.nombre)))),
  ], "Poner", async (f) => {
    const d = texto(f, "dia");
    const c = texto(f, "comida") as Comida;
    const previo = app.uno<PlatoMenu>(rutaMenu(d), idPlato(d, c));
    await app.guardar<PlatoMenu>(rutaMenu(d), { id: idPlato(d, c), fecha: d, comida: c, receta: r.id, texto: null, cocina: previo?.cocina ?? null });
    tostada(`En el menú el ${fechaCorta(d)} ✨`);
  });
}

async function editarReceta(app: Merviri, r: Registro<Receta> | null) {
  let creada = "";
  await dialogoFormulario(r ? "Editar receta" : "Nueva receta", [
    campo("Nombre", h("input", { name: "titulo", value: r?.titulo ?? "", required: true, maxlength: 100, autocomplete: "off" })),
    h("div", { class: "fila" },
      campo("Raciones", h("input", { type: "number", name: "raciones", min: 1, max: 50, value: r?.raciones ?? 2 })),
      campo("Minutos", h("input", { type: "number", name: "minutos", min: 1, max: 1440, value: r?.minutos ?? "" }))),
    campo("Ingredientes (uno por línea)", h("textarea", { name: "ingredientes", rows: 6, placeholder: "200 g de arroz\n2 huevos\nsal" }, ingredientesATexto(r?.ingredientes ?? [])),
      "Si empieza por una cantidad («200 g de…», «2…») se separa sola."),
    campo("Pasos", h("textarea", { name: "pasos", rows: 6, maxlength: 10_000 }, r?.pasos ?? "")),
    campo("Enlace (opcional)", h("input", { type: "url", name: "enlace", value: r?.enlace ?? "", placeholder: "https://…" })),
    campo("Etiquetas (separadas por comas)", h("input", { name: "etiquetas", value: r?.etiquetas.join(", ") ?? "", placeholder: "rápida, verano, horno" })),
  ], r ? "Guardar" : "Añadir", async (f) => {
    const rac = texto(f, "raciones");
    const min = texto(f, "minutos");
    const nueva: Receta = {
      id: r?.id ?? nuevoId(), titulo: texto(f, "titulo").trim(),
      raciones: rac ? Math.round(Number(rac)) : null, minutos: min ? Math.round(Number(min)) : null,
      ingredientes: leerIngredientes(texto(f, "ingredientes")), pasos: texto(f, "pasos").trim(),
      enlace: texto(f, "enlace").trim() || null,
      etiquetas: texto(f, "etiquetas").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10),
    };
    const p = problemaReceta(nueva);
    if (p) throw new Error(p);
    await app.guardar<Receta>(RUTA_RECETAS, nueva);
    if (!r) creada = nueva.id;
  });
  if (creada) location.hash = `#receta/${creada}`;
}
