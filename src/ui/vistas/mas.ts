import type { Merviri } from "../../app/app";
import { h } from "../dom";
import { dibujosSinVer } from "./dibujos";

/** «Más»: el resto de secciones (y las que llegarán). */
const PRONTO: [string, string][] = [["✨", "Planes"], ["💶", "Gastos"], ["🍝", "Menú"], ["📷", "Álbum"]];

export function vistaMas(app: Merviri): HTMLElement {
  const nuevos = dibujosSinVer(app).length;
  const casilla = (href: string, emoji: string, nombre: string, extra?: string) =>
    h("a", { class: "casilla-seccion activa", href },
      h("span", { class: "emoji", "aria-hidden": "true" }, emoji), h("b", {}, nombre), extra ? h("small", { class: "pastilla pastilla-rosa" }, extra) : null);
  return h("section", {},
    h("h1", {}, "Más"),
    h("div", { class: "cuadricula" },
      casilla("#notas", "🗒️", "Notas"),
      casilla("#dibujos", "🎨", "Dibujos", nuevos ? `${nuevos} nuevo${nuevos === 1 ? "" : "s"}` : undefined),
      casilla("#ajustes", "⚙️", "Ajustes"),
    ),
    h("h2", { class: "arriba-mas" }, "Lo que viene"),
    h("div", { class: "cuadricula" },
      PRONTO.map(([emoji, nombre]) =>
        h("div", { class: "casilla-seccion" }, h("span", { class: "emoji", "aria-hidden": "true" }, emoji), h("b", {}, nombre), h("small", {}, "pronto")))),
  );
}
