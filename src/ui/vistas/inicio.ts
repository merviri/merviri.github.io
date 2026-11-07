import type { Merviri } from "../../app/app";
import { fechaLarga, haceCuanto, hoy } from "../../dominio/fechas";
import { contador, otraPersona } from "../../dominio/pareja";
import { campoSecreto, conBoton, h, tostada } from "../dom";
import { texto } from "./comunes";

/** Lo que llegará en las próximas fases. */
const PROXIMAMENTE: [string, string][] = [
  ["📝", "Listas"], ["✅", "Tareas"], ["🗒️", "Notas"], ["🎨", "Dibujos"], ["🔔", "Avisos"],
  ["📅", "Calendario"], ["✨", "Planes"], ["💶", "Gastos"], ["🍝", "Menú"], ["📷", "Álbum"],
];

const DIA_SEMANA = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });

export function vistaInicio(app: Merviri): HTMLElement {
  const pareja = app.pareja();
  const yo = pareja.personas[app.persona];
  const otra = otraPersona(app.persona);
  const hoyF = hoy();
  const c = pareja.juntasDesde ? contador(pareja.juntasDesde, hoyF) : null;

  const ultimaDeOtra = app.dispositivos().find((d) => d.persona === otra);

  return h("section", {},
    h("div", { class: "saludo" },
      h("h1", {}, "Hola, ", h("span", { class: `t-${yo.color}` }, yo.nombre), " ✨"),
      h("p", { class: "secundario" }, `${DIA_SEMANA.format(new Date())}, ${fechaLarga(hoyF)}`),
    ),

    app.tocaPracticar() ? tarjetaPractica(app) : null,

    c
      ? h("div", { class: "tarjeta tarjeta-morada contador" },
        h("div", { class: "numero" }, c.dias.toLocaleString("es-ES")),
        h("div", { class: "etiqueta" }, c.dias === 1 ? "día juntas" : "días juntas"),
        h("ul", {},
          h("li", {}, c.aniversario.faltan === 0
            ? `¡Hoy es vuestro ${c.aniversario.anios}.º aniversario! 🎉`
            : `Faltan ${c.aniversario.faltan} ${c.aniversario.faltan === 1 ? "día" : "días"} para vuestro ${c.aniversario.anios}.º aniversario (${fechaLarga(c.aniversario.fecha)})`),
          h("li", {}, c.hito.faltan === 0
            ? `¡Hoy cumplís ${c.hito.dias.toLocaleString("es-ES")} días! 🎉`
            : `En ${c.hito.faltan} ${c.hito.faltan === 1 ? "día" : "días"} llegáis a ${c.hito.dias.toLocaleString("es-ES")} días`),
        ))
      : h("div", { class: "tarjeta tarjeta-morada" },
        h("p", {}, h("b", {}, "¿Desde cuándo estáis juntas?")),
        h("p", {}, "Poned la fecha y Merviri contará los días y os avisará de los aniversarios."),
        h("a", { class: "boton", href: "#ajustes" }, "Añadir la fecha")),

    ultimaDeOtra
      ? h("p", { class: "secundario" },
        h("i", { class: `punto-persona c-${pareja.personas[otra].color}`, "aria-hidden": "true" }), " ",
        `${pareja.personas[otra].nombre} abrió Merviri ${haceCuanto(ultimaDeOtra.ultimaVez)}.`)
      : h("div", { class: "tarjeta tarjeta-rosa" },
        h("p", {}, h("b", {}, `Falta ${pareja.personas[otra].nombre}`)),
        h("p", {}, "Vincula su móvil con un código QR: en Ajustes → Vincular otro dispositivo."),
        h("a", { class: "boton", href: "#vincular-otro" }, "Vincular su móvil")),

    h("h2", { class: "arriba-mas" }, "Lo que viene"),
    h("div", { class: "cuadricula" },
      PROXIMAMENTE.map(([emoji, nombre]) =>
        h("div", { class: "casilla-seccion" }, h("span", { class: "emoji", "aria-hidden": "true" }, emoji), h("b", {}, nombre), h("small", {}, "pronto")))),
  );
}

function tarjetaPractica(app: Merviri): HTMLElement {
  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "submit", class: "boton boton-primario" }, "Comprobar");
  const f = h("form", { class: "formulario" },
    campoSecreto("contrasena", "Contraseña de Merviri", { autocomplete: "current-password" }),
    error,
    h("div", { class: "botones" },
      boton,
      h("button", { type: "button", class: "boton", onclick: () => void app.practicaHecha(true).then(() => app.refrescar()) }, "Ahora no"),
    ),
  );
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(boton, async () => {
      const ok = await app.comprobarContrasena(texto(new FormData(f), "contrasena"));
      await app.practicaHecha(ok);
      if (ok) tostada("¡Perfecto! Te lo vuelvo a preguntar dentro de un mes.");
      else {
        const pista = app.llavero?.pista;
        throw new Error(`No es esa.${pista ? ` Pista: ${pista}.` : ""} Te lo vuelvo a preguntar en una semana; puedes cambiarla en Ajustes.`);
      }
      app.refrescar();
    }, error);
  });
  return h("div", { class: "tarjeta tarjeta-rosa" },
    h("p", {}, h("b", {}, "¿Te acuerdas de la contraseña de Merviri?")),
    h("p", {}, "Escríbela de vez en cuando para no olvidarla: solo hace falta al vincular un dispositivo."),
    f,
  );
}
