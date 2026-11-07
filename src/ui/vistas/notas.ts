import type { Merviri } from "../../app/app";
import { haceCuanto } from "../../dominio/fechas";
import { COLORES_NOTA, LIMITE_NOTA, notaVacia, ordenarNotas, resumen, RUTA_NOTAS, type ColorNota, type Nota } from "../../dominio/notas";
import { esIdPersona } from "../../dominio/pareja";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { confirmarPeligro, h, tostada } from "../dom";
import { volver } from "./comunes";

const NOMBRE_COLOR: Record<ColorNota, string> = {
  blanco: "Blanco", rosa: "Rosa", turquesa: "Turquesa", morado: "Morado", amarillo: "Amarillo",
};

export function vistaNotas(app: Merviri): HTMLElement {
  const pareja = app.pareja();
  const notas = ordenarNotas(app.lista<Nota>(RUTA_NOTAS));
  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Notas"),
      h("a", { class: "boton boton-primario", href: `#nota/${nuevoId()}` }, "+ Nueva"),
    ),
    notas.length
      ? h("div", { class: "notas" }, notas.map((n) => h("a", { class: `nota nota-${n.color}`, href: `#nota/${n.id}` },
        n.fijada ? h("span", { class: "chincheta", "aria-label": "Fijada" }, "📌") : null,
        n.titulo.trim() ? h("b", {}, n.titulo) : null,
        n.texto.trim() ? h("p", {}, resumen(n.texto)) : null,
        h("small", {}, `${esIdPersona(n.por) ? pareja.personas[n.por].nombre : ""} · ${haceCuanto(n.actualizado)}`))))
      : h("p", { class: "secundario" }, "Aquí va lo que no es una tarea ni una lista: ideas, planes a medias, el wifi de casa, recetas… Todo va cifrado."),
  );
}

/** Editor: se guarda solo mientras escribes. */
export function vistaNota(app: Merviri, id: string): HTMLElement {
  const existente = app.uno<Nota>(RUTA_NOTAS, id);
  let nota: Nota = existente
    ? { id, titulo: existente.titulo, texto: existente.texto, color: existente.color, fijada: existente.fijada }
    : { id, titulo: "", texto: "", color: "blanco", fijada: false };
  const pareja = app.pareja();

  const titulo = h("input", { class: "nota-titulo", value: nota.titulo, placeholder: "Título", maxlength: 120, "aria-label": "Título", name: "titulo" });
  const cuerpo = h("textarea", { class: "nota-texto", placeholder: "Escribe aquí…", maxlength: LIMITE_NOTA, "aria-label": "Texto", name: "texto" }, nota.texto);
  const estado = h("small", { class: "secundario", "aria-live": "polite" },
    existente ? `${esIdPersona(existente.por) ? pareja.personas[existente.por].nombre : ""} · ${haceCuanto(existente.actualizado)}` : "");
  const contenedor = h("div", { class: `editor-nota nota-${nota.color}` });

  let temporizador: ReturnType<typeof setTimeout> | null = null;
  const guardar = async () => {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    nota = { ...nota, titulo: titulo.value, texto: cuerpo.value };
    if (notaVacia(nota) && !app.uno<Nota>(RUTA_NOTAS, id)) return;
    await app.guardar<Nota>(RUTA_NOTAS, nota);
    estado.textContent = "Guardado";
  };
  const programar = () => {
    estado.textContent = "…";
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void guardar(), 800);
  };
  titulo.addEventListener("input", programar);
  cuerpo.addEventListener("input", () => { ajustarAltura(); programar(); });
  // Al salir de la pantalla, se guarda lo pendiente.
  window.addEventListener("hashchange", () => { if (temporizador) void guardar(); }, { once: true });

  const ajustarAltura = () => {
    cuerpo.style.height = "auto";
    cuerpo.style.height = `${Math.max(cuerpo.scrollHeight, 240)}px`;
  };
  requestAnimationFrame(ajustarAltura);

  const colores = h("div", { class: "colores", role: "radiogroup", "aria-label": "Color" },
    COLORES_NOTA.map((c) => {
      const b = h("button", {
        type: "button", class: `muestra nota-${c}`, role: "radio", "aria-checked": String(nota.color === c),
        "aria-label": NOMBRE_COLOR[c], title: NOMBRE_COLOR[c],
      });
      b.addEventListener("click", () => {
        nota = { ...nota, color: c };
        contenedor.className = `editor-nota nota-${c}`;
        colores.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
        void guardar();
      });
      return b;
    }));

  const fijar = h("button", { type: "button", class: "boton", "aria-pressed": String(nota.fijada) }, nota.fijada ? "📌 Fijada" : "📌 Fijar");
  fijar.addEventListener("click", () => {
    nota = { ...nota, fijada: !nota.fijada };
    fijar.setAttribute("aria-pressed", String(nota.fijada));
    fijar.textContent = nota.fijada ? "📌 Fijada" : "📌 Fijar";
    void guardar();
  });

  const borrar = h("button", { type: "button", class: "boton boton-peligro" }, "Borrar");
  borrar.addEventListener("click", async () => {
    const actual = app.uno<Nota>(RUTA_NOTAS, id);
    if (!actual) { location.hash = "#notas"; return; }
    if (!(await confirmarPeligro("Borrar la nota", "Se borra para las dos.", "Borrar"))) return;
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    await app.borrar(RUTA_NOTAS, id);
    location.hash = "#notas";
    tostada("Nota borrada", "info", { texto: "Deshacer", hacer: () => void app.guardar<Nota>(RUTA_NOTAS, { ...nota }) });
  });

  contenedor.append(titulo, cuerpo);
  return h("section", {},
    volver("#notas", "Notas"),
    contenedor,
    h("div", { class: "barra-nota" }, colores, estado),
    h("div", { class: "botones" }, fijar, borrar),
  );
}
