import type { Merviri } from "../../app/app";
import { haceCuanto } from "../../dominio/fechas";
import {
  EMOJIS_LISTA,
  ordenarElementos,
  PLANTILLAS,
  problemaElemento,
  problemaLista,
  RUTA_LISTAS,
  rutaElementos,
  separarCantidad,
  type Elemento,
  type Lista,
} from "../../dominio/listas";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { avisarElemento } from "../../app/eventos";
import { campo, confirmarPeligro, dialogoFormulario, h, tostada } from "../dom";
import { texto, volver } from "./comunes";

const pendientesDe = (app: Merviri, l: Lista) =>
  app.lista<Elemento>(rutaElementos(l.id)).filter((e) => !e.hecho).length;

export function listasOrdenadas(app: Merviri): Registro<Lista>[] {
  return app.lista<Lista>(RUTA_LISTAS).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
}

/** Pantalla con todas las listas. */
export function vistaListas(app: Merviri): HTMLElement {
  const listas = listasOrdenadas(app);
  const existentes = new Set(listas.map((l) => l.nombre.toLowerCase()));
  const sugerencias = PLANTILLAS.filter((p) => !existentes.has(p.nombre.toLowerCase()));

  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Listas"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void nuevaLista(app) }, "+ Nueva"),
    ),
    listas.length
      ? h("ul", { class: "tarjetas-lista" }, listas.map((l) => {
        const n = pendientesDe(app, l);
        return h("li", {}, h("a", { class: "tarjeta-enlace", href: `#lista/${l.id}` },
          h("span", { class: "emoji-grande", "aria-hidden": "true" }, l.emoji),
          h("span", { class: "crece" }, h("b", {}, l.nombre), h("small", { class: "secundario" }, n ? `${n} pendiente${n === 1 ? "" : "s"}` : "Todo hecho ✨")),
          h("span", { class: "flecha", "aria-hidden": "true" }, "›")));
      }))
      : h("p", { class: "secundario" }, "Todavía no hay listas. Empezad con alguna de estas:"),
    sugerencias.length
      ? h("div", { class: "fichas" }, sugerencias.map((p) => h("button", {
        type: "button", class: "ficha",
        onclick: async () => {
          const id = nuevoId();
          await app.guardar<Lista>(RUTA_LISTAS, { id, nombre: p.nombre, emoji: p.emoji, orden: Date.now() });
          location.hash = `#lista/${id}`;
        },
      }, `${p.emoji} ${p.nombre}`)))
      : null,
  );
}

function selectorEmoji(actual: string) {
  return h("div", { class: "selector-emoji", role: "radiogroup", "aria-label": "Icono" },
    EMOJIS_LISTA.map((e) => h("label", {},
      h("input", { type: "radio", name: "emoji", value: e, checked: e === actual }),
      h("span", {}, e))));
}

async function nuevaLista(app: Merviri) {
  let id = "";
  const ok = await dialogoFormulario("Nueva lista", [
    campo("Nombre", h("input", { name: "nombre", required: true, maxlength: 50, autocomplete: "off" })),
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Icono"), selectorEmoji("📝")),
  ], "Crear", async (d) => {
    const nombre = texto(d, "nombre").trim();
    const p = problemaLista(nombre);
    if (p) throw new Error(p);
    id = nuevoId();
    await app.guardar<Lista>(RUTA_LISTAS, { id, nombre, emoji: texto(d, "emoji") || "📝", orden: Date.now() });
  });
  if (ok) location.hash = `#lista/${id}`;
}

/** Una lista con sus elementos. */
export function vistaLista(app: Merviri, id: string): HTMLElement {
  const lista = app.uno<Lista>(RUTA_LISTAS, id);
  if (!lista) {
    return h("section", {}, volver("#listas", "Listas"), h("p", {}, "Esta lista ya no existe."));
  }
  const ruta = rutaElementos(id);
  const { pendientes, hechos } = ordenarElementos(app.lista<Elemento>(ruta));
  const pareja = app.pareja();

  const entrada = h("input", {
    name: "nuevo", placeholder: "Añadir…", autocomplete: "off", maxlength: 200, "aria-label": `Añadir a ${lista.nombre}`,
    enterkeyhint: "done", "data-refrescable": true,
  });
  const form = h("form", { class: "anadir" }, entrada, h("button", { type: "submit", class: "boton boton-primario", "aria-label": "Añadir" }, "+"));
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { texto: t, cantidad } = separarCantidad(entrada.value);
    if (problemaElemento(t)) return;
    entrada.value = "";
    entrada.focus();
    void app.guardar<Elemento>(ruta, {
      id: nuevoId(), texto: t, cantidad, nota: null, hecho: false, hechoPor: null, hechoEn: null, orden: -Date.now(),
    });
    avisarElemento(app, lista, cantidad ? `${cantidad} ${t}` : t);
  });

  const fila = (e: Registro<Elemento>) => {
    const casilla = h("input", { type: "checkbox", checked: e.hecho, "aria-label": e.texto });
    casilla.addEventListener("change", () => {
      void app.guardar<Elemento>(ruta, {
        ...e, hecho: casilla.checked, hechoPor: casilla.checked ? app.persona : null,
        hechoEn: casilla.checked ? new Date().toISOString() : null,
      });
    });
    const quien = e.hecho && e.hechoPor ? pareja.personas[e.hechoPor] : null;
    return h("li", { class: e.hecho ? "hecho" : "" },
      h("label", { class: "casilla-grande" }, casilla, h("span", { class: "marca", "aria-hidden": "true" })),
      h("button", { type: "button", class: "elemento", onclick: () => void editarElemento(app, ruta, e) },
        h("span", {}, e.cantidad ? h("b", { class: "cantidad" }, `${e.cantidad} `) : null, e.texto),
        e.nota ? h("small", { class: "secundario" }, e.nota) : null,
        quien ? h("small", { class: "secundario" }, `${quien.nombre} · ${haceCuanto(e.hechoEn!)}`) : null,
      ));
  };

  return h("section", {},
    volver("#listas", "Listas"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, `${lista.emoji} ${lista.nombre}`),
      h("button", { type: "button", class: "boton", onclick: () => void editarLista(app, lista) }, "Editar"),
    ),
    form,
    pendientes.length
      ? h("ul", { class: "elementos" }, pendientes.map(fila))
      : h("p", { class: "secundario centro arriba" }, hechos.length ? "¡Todo hecho! ✨" : "Lista vacía. Escribe arriba para añadir."),
    hechos.length
      ? h("details", { class: "hechos" },
        h("summary", {}, `Hechos (${hechos.length})`),
        h("ul", { class: "elementos" }, hechos.map(fila)),
        h("button", {
          type: "button", class: "boton boton-peligro arriba",
          onclick: async () => {
            if (!(await confirmarPeligro("Borrar los hechos", `Se borran ${hechos.length} elemento(s) marcados como hechos.`, "Borrar"))) return;
            for (const e of hechos) await app.borrar(ruta, e.id);
          },
        }, "Borrar los hechos"))
      : null,
  );
}

async function editarElemento(app: Merviri, ruta: string, e: Registro<Elemento>) {
  let borrar = false;
  await dialogoFormulario("Editar", [
    campo("Qué", h("input", { name: "texto", value: e.texto, required: true, maxlength: 200 })),
    campo("Cantidad (opcional)", h("input", { name: "cantidad", value: e.cantidad ?? "", maxlength: 30 })),
    campo("Nota (opcional)", h("input", { name: "nota", value: e.nota ?? "", maxlength: 200 })),
    h("button", {
      type: "button", class: "enlace-boton peligro",
      onclick: (ev: Event) => {
        borrar = true;
        (ev.target as HTMLElement).closest("form")!.requestSubmit();
      },
    }, "Borrar este elemento"),
  ], "Guardar", async (d) => {
    if (borrar) {
      await app.borrar(ruta, e.id);
      tostada("Borrado", "info", { texto: "Deshacer", hacer: () => void app.guardar<Elemento>(ruta, { ...e }) });
      return;
    }
    const t = texto(d, "texto").trim();
    const p = problemaElemento(t);
    if (p) throw new Error(p);
    await app.guardar<Elemento>(ruta, {
      ...e, texto: t, cantidad: texto(d, "cantidad").trim() || null, nota: texto(d, "nota").trim() || null,
    });
  });
}

async function editarLista(app: Merviri, l: Registro<Lista>) {
  let borrar = false;
  const ok = await dialogoFormulario("Editar lista", [
    campo("Nombre", h("input", { name: "nombre", value: l.nombre, required: true, maxlength: 50 })),
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Icono"), selectorEmoji(l.emoji)),
    h("button", {
      type: "button", class: "enlace-boton peligro",
      onclick: (ev: Event) => {
        borrar = true;
        (ev.target as HTMLElement).closest("form")!.requestSubmit();
      },
    }, "Borrar la lista"),
  ], "Guardar", async (d) => {
    if (borrar) {
      if (!(await confirmarPeligro("Borrar la lista", `Se borra «${l.nombre}» con todo lo que tiene, para las dos.`, "Borrar"))) {
        borrar = false;
        throw new Error("No se ha borrado.");
      }
      for (const e of app.lista<Elemento>(rutaElementos(l.id))) await app.borrar(rutaElementos(l.id), e.id);
      await app.borrar(RUTA_LISTAS, l.id);
      return;
    }
    const nombre = texto(d, "nombre").trim();
    const p = problemaLista(nombre);
    if (p) throw new Error(p);
    await app.guardar<Lista>(RUTA_LISTAS, { ...l, nombre, emoji: texto(d, "emoji") || l.emoji });
  });
  if (ok && borrar) location.hash = "#listas";
}
