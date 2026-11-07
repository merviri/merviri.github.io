import type { Merviri } from "../../app/app";
import { enlaceVinculo } from "../../cifrado/vinculo";
import { campoSecreto, conBoton, copiar, h, icono, tostada } from "../dom";
import { qrSvg } from "../qr";
import { texto, volver } from "./comunes";

/** Muestra el QR (y el enlace) para vincular otro dispositivo. */
export function vistaVincularOtro(app: Merviri): HTMLElement {
  const zona = h("div");
  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "submit", class: "boton boton-primario" }, "Crear el código");
  const f = h("form", { class: "formulario" },
    campoSecreto("contrasena", "Contraseña de Merviri", {
      autocomplete: "current-password",
      ayuda: "El código va cifrado con la contraseña: el otro dispositivo tendrá que escribirla también.",
    }),
    error,
    h("div", {}, boton),
  );
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(boton, async () => {
      const codigo = await app.crearCodigoVinculo(texto(new FormData(f), "contrasena"));
      f.reset();
      mostrar(enlaceVinculo(location.origin, codigo));
    }, error);
  });

  let temporizador: ReturnType<typeof setTimeout> | null = null;
  function mostrar(enlace: string) {
    if (temporizador) clearTimeout(temporizador);
    const compartir = "share" in navigator
      ? h("button", {
        type: "button", class: "boton",
        onclick: () => void navigator.share({ title: "Merviri", text: "Vincula tu dispositivo a Merviri ✨", url: enlace }).catch(() => undefined),
      }, icono("compartir"), "Enviar el enlace")
      : null;
    zona.replaceChildren(h("div", { class: "tarjeta" },
      h("div", { class: "qr-caja" }, qrSvg(enlace)),
      h("ol", {},
        h("li", {}, "En el otro móvil, abre la cámara y apunta al código."),
        h("li", {}, "Toca el enlace que aparece: se abrirá Merviri en Chrome."),
        h("li", {}, "Escribe la contraseña y elige quién eres."),
        h("li", {}, "En Chrome, menú ⋮ → «Instalar aplicación» para tenerla como una app."),
      ),
      h("p", { class: "secundario pequeno" },
        "¿Es un ordenador? Envíale el enlace y ábrelo allí. Va cifrado con vuestra contraseña, pero aun así no lo publiques en ningún sitio."),
      h("div", { class: "botones" },
        h("button", { type: "button", class: "boton", onclick: () => void copiar(enlace, "Enlace copiado") }, icono("copiar"), "Copiar el enlace"),
        compartir,
        h("button", { type: "button", class: "boton", onclick: () => zona.replaceChildren() }, "Ocultar"),
      ),
    ));
    // Por si se queda la pantalla abierta: el código se oculta a los 10 minutos.
    temporizador = setTimeout(() => {
      if (zona.isConnected && zona.firstChild) {
        zona.replaceChildren();
        tostada("El código se ha ocultado. Crea otro si lo necesitas.");
      }
    }, 10 * 60 * 1000);
  }

  return h("section", {},
    volver(),
    h("h1", {}, "Vincular otro dispositivo"),
    h("p", {}, "Para el móvil de la otra, otro móvil o un ordenador. Solo se hace una vez por dispositivo."),
    h("div", { class: "tarjeta" }, f),
    zona,
  );
}
