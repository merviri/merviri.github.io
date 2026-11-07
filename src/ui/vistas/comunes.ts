import type { IdPersona, Pareja } from "../../dominio/pareja";
import { h, icono } from "../dom";

/** Enlace «volver» al principio de una pantalla. */
export const volver = (destino = "#ajustes", texto = "Ajustes") =>
  h("a", { class: "volver", href: destino }, icono("atras"), texto);

/** Elegir quién usa este dispositivo (Elvira turquesa, María rosa). */
export function elegirPersona(pareja: Pareja, actual: IdPersona | null, nombre = "persona"): HTMLElement {
  return h("fieldset", { class: "campo grupo" },
    h("legend", { class: "grupo-titulo" }, "¿Quién usa este dispositivo?"),
    h("div", { class: "personas" },
      (["p1", "p2"] as const).map((id) => {
        const p = pareja.personas[id];
        return h("label", { class: `persona-opcion p-${p.color}` },
          h("input", { type: "radio", name: nombre, value: id, required: true, checked: actual === id }),
          h("span", {}, h("i", { class: `punto-persona c-${p.color}`, "aria-hidden": "true" }), p.nombre));
      }),
    ),
  );
}

export const puntoPersona = (pareja: Pareja, id: IdPersona) =>
  h("i", { class: `punto-persona c-${pareja.personas[id].color}`, "aria-hidden": "true" });

export function leerPersona(datos: FormData, nombre = "persona"): IdPersona {
  const v = datos.get(nombre);
  if (v !== "p1" && v !== "p2") throw new Error("Elige quién usa este dispositivo.");
  return v;
}

export function texto(datos: FormData, nombre: string): string {
  const v = datos.get(nombre);
  return typeof v === "string" ? v : "";
}

/** Indicador de pasos (bienvenida). */
export const pasos = (total: number, actual: number) =>
  h("div", { class: "pasos", "aria-label": `Paso ${actual} de ${total}` },
    Array.from({ length: total }, (_, i) => h("span", { class: i < actual ? "hecho" : "" })));
