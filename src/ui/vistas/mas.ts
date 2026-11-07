import type { Merviri } from "../../app/app";
import { h } from "../dom";
import { dibujosSinVer } from "./dibujos";
import { pendientesNosotras } from "./juntas";

/** «Más»: el resto de secciones. */

export function vistaMas(app: Merviri): HTMLElement {
  const nuevos = dibujosSinVer(app).length;
  const nosotras = pendientesNosotras(app);
  const casilla = (href: string, emoji: string, nombre: string, extra?: string) =>
    h("a", { class: "casilla-seccion activa", href },
      h("span", { class: "emoji", "aria-hidden": "true" }, emoji), h("b", {}, nombre), extra ? h("small", { class: "pastilla pastilla-rosa" }, extra) : null);
  return h("section", {},
    h("h1", {}, "Más"),
    h("div", { class: "cuadricula" },
      casilla("#nosotras", "💞", "Nosotras", nosotras ? `${nosotras} para ti` : undefined),
      casilla("#album", "📷", "Álbum"),
      casilla("#gastos", "💶", "Gastos"),
      casilla("#menu", "🍝", "Menú"),
      casilla("#recetas", "📖", "Recetas"),
      casilla("#descubrir", "🔎", "Descubrir"),
      casilla("#notas", "🗒️", "Notas"),
      casilla("#dibujos", "🎨", "Dibujos", nuevos ? `${nuevos} nuevo${nuevos === 1 ? "" : "s"}` : undefined),
      casilla("#ajustes", "⚙️", "Ajustes"),
    ),
    h("p", { class: "secundario pequeno arriba-mas" }, "¿Echáis algo en falta? Se puede añadir cuando queráis ✨"),
  );
}
