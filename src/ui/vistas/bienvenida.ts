import type { Comprobacion, Merviri } from "../../app/app";
import { abrirConContrasena, crearLlavero, problemaContrasena, type ClaveAbierta, type Llavero } from "../../cifrado/llavero";
import { abrirVinculo } from "../../cifrado/vinculo";
import { problemaToken } from "../../dominio/acceso";
import { nombrePorDefecto } from "../../dominio/dispositivos";
import { esFecha } from "../../dominio/fechas";
import { ID_PAREJA, PAREJA_INICIAL, type Pareja } from "../../dominio/pareja";
import { campo, campoSecreto, conBoton, copiar, descargar, h, tostada, type Hijo } from "../dom";
import { elegirPersona, leerPersona, pasos, texto } from "./comunes";
import { mensajeError } from "./errores";

/**
 * Primera vez en este dispositivo:
 *  - crear Merviri (Elvira, una sola vez): conectar → contraseña → código de recuperación → vosotras;
 *  - unirse con un enlace o QR (lo normal): contraseña → quién eres;
 *  - unirse a mano con el token: conectar → contraseña → quién eres.
 */
type Paso = "inicio" | "ya" | "conectar" | "contrasena" | "codigo" | "vosotras" | "entrar" | "recuperar" | "quien" | "vincular";

interface Ctx {
  comp?: Comprobacion;
  creado?: { llavero: Llavero; codigo: string; abierta: ClaveAbierta };
  abierta?: ClaveAbierta;
  pareja?: Pareja;
}

const DEV = import.meta.env.DEV;

export function vistaBienvenida(app: Merviri, codigoVinculo: string | null): HTMLElement {
  const raiz = h("div");
  const ctx: Ctx = {};
  let paso: Paso = codigoVinculo ? "vincular" : "inicio";

  const ir = (p: Paso) => {
    paso = p;
    pintar();
    window.scrollTo(0, 0);
    raiz.querySelector<HTMLElement>("input:not([type=hidden]), button")?.focus({ preventScroll: true });
  };

  /** Formulario con su botón y su línea de error. */
  function formulario(hijos: Hijo, boton: string, enviar: (d: FormData) => Promise<void>, ctxError: "contrasena" | "general" = "general") {
    const error = h("p", { class: "error", role: "alert" });
    const b = h("button", { type: "submit", class: "boton boton-primario boton-ancho" }, boton);
    const f = h("form", { class: "formulario" }, hijos, error, b);
    f.addEventListener("submit", (ev) => {
      ev.preventDefault();
      void conBoton(b, async () => {
        try {
          await enviar(new FormData(f));
        } catch (e) {
          throw new Error(mensajeError(e, ctxError));
        }
      }, error);
    });
    return f;
  }

  const atras = (p: Paso, t = "Atrás") => h("button", { type: "button", class: "enlace-boton", onclick: () => ir(p) }, t);

  function pintar() {
    raiz.replaceChildren(contenido());
  }

  function contenido(): HTMLElement {
    switch (paso) {
      case "inicio":
        return h("section", { class: "bienvenida" },
          h("img", { class: "logo-grande", src: "/icono.svg", alt: "" }),
          h("h1", {}, "Merviri"),
          h("p", { class: "lema" }, "La app de Elvira y María ✨"),
          h("div", { class: "botones-columna" },
            h("button", { class: "boton boton-primario", onclick: () => ir("conectar") }, "Empezar Merviri"),
            h("button", { class: "boton", onclick: () => ir("ya") }, "Ya tenemos Merviri"),
          ),
          h("p", { class: "secundario pequeno arriba-mas" },
            "«Empezar» se hace una sola vez. Si la otra ya usa Merviri, elige «Ya tenemos Merviri»."),
        );

      case "ya":
        return h("section", {},
          h("h1", {}, "Vincular este dispositivo"),
          h("div", { class: "tarjeta" },
            h("p", {}, "Pídele a la otra el código QR: en su Merviri, ", h("b", {}, "Ajustes → Vincular otro dispositivo"), "."),
            h("p", {}, "Escanéalo con la cámara de este móvil: se abrirá Merviri y solo tendrás que escribir la contraseña."),
            h("p", { class: "secundario" }, "¿Estás en un ordenador? Que te envíe el enlace y ábrelo aquí."),
          ),
          h("div", { class: "botones" },
            h("button", { class: "boton", onclick: () => ir("conectar") }, "Conectar a mano con el token"),
          ),
          h("p", { class: "arriba" }, atras("inicio")),
        );

      case "conectar":
        return h("section", {},
          h("h1", {}, "Conectar con GitHub"),
          h("p", { class: "secundario" },
            "Merviri guarda vuestros datos cifrados en el repositorio privado ", h("b", {}, "merviri/datos"),
            ". El token y la fecha los ves al crearlo en GitHub (las instrucciones están en el README)."),
          formulario([
            campo("Organización", h("input", { name: "propietario", value: "merviri", required: true, autocapitalize: "off", spellcheck: "false" })),
            campo("Repositorio de datos", h("input", { name: "repositorio", value: "datos", required: true, autocapitalize: "off", spellcheck: "false" })),
            campoSecreto("token", "Token de GitHub", {
              ayuda: DEV ? "En desarrollo puedes escribir «falso» para probar sin GitHub." : "Empieza por github_pat_. Se guarda cifrado solo en este dispositivo.",
            }),
            campo("Caduca el", h("input", { name: "caduca", type: "date" }), "La fecha que elegiste al crearlo. Merviri avisará dos semanas antes."),
          ], "Comprobar", async (d) => {
            const token = texto(d, "token").trim();
            const problema = problemaToken(token);
            if (problema) throw new Error(problema);
            const caduca = texto(d, "caduca");
            const comp = await app.comprobar({
              propietario: texto(d, "propietario").trim(), repositorio: texto(d, "repositorio").trim(), token,
              caduca: esFecha(caduca) ? caduca : null,
            });
            ctx.comp = comp;
            ir(comp.llavero ? "entrar" : "contrasena");
          }),
          h("p", { class: "arriba" }, atras("inicio")),
        );

      case "contrasena":
        return h("section", {},
          pasos(3, 1),
          h("h1", {}, "Vuestra contraseña"),
          h("div", { class: "tarjeta tarjeta-morada" },
            h("p", {}, "Esta contraseña la compartís las dos. Con ella se cifra todo: en GitHub solo habrá datos ilegibles."),
            h("p", {}, "Solo la escribiréis al vincular un dispositivo nuevo. Mejor una frase larga que podáis recordar."),
          ),
          formulario([
            campoSecreto("contrasena", "Contraseña", { autocomplete: "new-password", ayuda: "Al menos 10 caracteres." }),
            campoSecreto("repetir", "Repítela", { autocomplete: "new-password" }),
            campo("Pista (opcional)", h("input", { name: "pista", maxlength: 200, autocomplete: "off" }),
              "Se guarda sin cifrar: que solo la entendáis vosotras, y nunca la contraseña a medias."),
          ], "Seguir", async (d) => {
            const c = texto(d, "contrasena");
            const pista = texto(d, "pista").trim() || null;
            if (c !== texto(d, "repetir")) throw new Error("Las dos contraseñas no coinciden.");
            const problema = problemaContrasena(c, pista);
            if (problema) throw new Error(problema);
            ctx.creado = await crearLlavero(c, pista);
            ir("codigo");
          }),
          h("p", { class: "arriba" }, atras("conectar")),
        );

      case "codigo": {
        const codigo = ctx.creado!.codigo;
        const grupos = codigo.split("-");
        const ultimo = grupos[grupos.length - 1]!;
        return h("section", {},
          pasos(3, 2),
          h("h1", {}, "Código de recuperación"),
          h("p", {}, "Si algún día olvidáis la contraseña, con este código podréis entrar y poner otra."),
          h("div", { class: "tarjeta" },
            h("div", { class: "codigo", "aria-label": `Código: ${codigo}` }, grupos.map((g) => h("span", {}, g))),
            h("div", { class: "botones" },
              h("button", { type: "button", class: "boton", onclick: () => void copiar(codigo, "Código copiado") }, "Copiar"),
              h("button", {
                type: "button", class: "boton",
                onclick: () => descargar("merviri-codigo-de-recuperacion.txt",
                  `Código de recuperación de Merviri\n\n${codigo}\n\nGuárdalo en un sitio seguro. Sirve para entrar si olvidáis la contraseña.\n`),
              }, "Guardar en un archivo"),
            ),
          ),
          h("p", { class: "secundario" },
            "Guardadlo fuera del móvil: impreso, o en el gestor de contraseñas de Google. Sin la contraseña ni este código, nadie (tampoco vosotras) podrá recuperar los datos."),
          formulario([
            campo(`Escribe el último grupo (el que acaba en «${ultimo.slice(-1)}») para comprobar que lo tienes`,
              h("input", { name: "ultimo", required: true, autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: 4 })),
            h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "guardado", required: true }), "Lo he guardado en un sitio seguro"),
          ], "Seguir", async (d) => {
            if (texto(d, "ultimo").trim().toUpperCase() !== ultimo) throw new Error("No coincide con el último grupo del código.");
            ir("vosotras");
          }),
        );
      }

      case "vosotras": {
        const nombreDisp = h("input", { name: "dispositivo", required: true, maxlength: 40, value: nombrePorDefecto("Elvira", navigator.userAgent) });
        let tocado = false;
        nombreDisp.addEventListener("input", () => { tocado = true; });
        const f = formulario([
          campo("Nombre de la persona turquesa", h("input", { name: "n1", value: "Elvira", required: true, maxlength: 40 })),
          campo("Nombre de la persona rosa", h("input", { name: "n2", value: "María", required: true, maxlength: 40 })),
          campo("¿Desde cuándo estáis juntas? (opcional)", h("input", { name: "desde", type: "date" }),
            "Merviri contará los días y os avisará de los aniversarios."),
          elegirPersona(PAREJA_INICIAL, "p1"),
          campo("Nombre de este dispositivo", nombreDisp),
        ], "Crear Merviri ✨", async (d) => {
          const desde = texto(d, "desde");
          const pareja: Pareja = {
            id: ID_PAREJA,
            personas: { p1: { nombre: texto(d, "n1").trim(), color: "turquesa" }, p2: { nombre: texto(d, "n2").trim(), color: "rosa" } },
            juntasDesde: esFecha(desde) ? desde : null,
          };
          const c = ctx.creado!;
          await app.crear(ctx.comp!, c.llavero, c.abierta, pareja, leerPersona(d), texto(d, "dispositivo"));
          tostada("¡Merviri está lista! ✨");
        });
        f.addEventListener("change", (ev) => {
          const t = ev.target as HTMLInputElement;
          if (t.name !== "persona" || tocado) return;
          const fd = new FormData(f);
          nombreDisp.value = nombrePorDefecto(texto(fd, t.value === "p1" ? "n1" : "n2") || "ti", navigator.userAgent);
        });
        return h("section", {}, pasos(3, 3), h("h1", {}, "Vosotras"), f);
      }

      case "entrar": {
        const pista = ctx.comp!.llavero!.llavero.pista;
        const verPista = h("p", { class: "secundario", hidden: true }, pista ? `Pista: ${pista}` : "No pusisteis pista.");
        return h("section", {},
          h("h1", {}, "Hola de nuevo ✨"),
          h("p", {}, "Escribe la contraseña de Merviri (la misma que usa la otra)."),
          formulario([
            campoSecreto("contrasena", "Contraseña", { autocomplete: "current-password" }),
            verPista,
          ], "Entrar", async (d) => {
            ctx.abierta = await abrirConContrasena(ctx.comp!.llavero!.llavero, texto(d, "contrasena"));
            ctx.pareja = await app.leerPareja(ctx.comp!, ctx.abierta);
            ir("quien");
          }, "contrasena"),
          h("div", { class: "botones" },
            h("button", { type: "button", class: "boton", onclick: () => { verPista.hidden = false; } }, "Ver la pista"),
            h("button", { type: "button", class: "boton", onclick: () => ir("recuperar") }, "He olvidado la contraseña"),
          ),
        );
      }

      case "recuperar":
        return h("section", {},
          h("h1", {}, "Usar el código de recuperación"),
          h("p", {}, "Escribe el código de recuperación y elige una contraseña nueva. La otra tendrá que usar la nueva la próxima vez que vincule un dispositivo."),
          formulario([
            campo("Código de recuperación", h("input", { name: "codigo", required: true, autocomplete: "off", autocapitalize: "characters", spellcheck: "false" })),
            campoSecreto("contrasena", "Contraseña nueva", { autocomplete: "new-password", ayuda: "Al menos 10 caracteres." }),
            campoSecreto("repetir", "Repítela", { autocomplete: "new-password" }),
            campo("Pista nueva (opcional)", h("input", { name: "pista", maxlength: 200, autocomplete: "off" })),
          ], "Cambiar la contraseña y entrar", async (d) => {
            const c = texto(d, "contrasena");
            const pista = texto(d, "pista").trim() || null;
            if (c !== texto(d, "repetir")) throw new Error("Las dos contraseñas no coinciden.");
            const problema = problemaContrasena(c, pista);
            if (problema) throw new Error(problema);
            const r = await app.recuperar(ctx.comp!, texto(d, "codigo"), c, pista);
            ctx.comp = r.c;
            ctx.abierta = r.abierta;
            ctx.pareja = await app.leerPareja(ctx.comp, ctx.abierta);
            tostada("Contraseña cambiada");
            ir("quien");
          }),
          h("p", { class: "arriba" }, atras("entrar")),
        );

      case "quien": {
        const pareja = ctx.pareja ?? PAREJA_INICIAL;
        const nombreDisp = h("input", { name: "dispositivo", required: true, maxlength: 40, value: "" });
        let tocado = false;
        nombreDisp.addEventListener("input", () => { tocado = true; });
        const f = formulario([
          elegirPersona(pareja, null),
          campo("Nombre de este dispositivo", nombreDisp, "Así lo veréis en la lista de dispositivos."),
        ], "Entrar en Merviri", async (d) => {
          await app.unirse(ctx.comp!, ctx.abierta!, leerPersona(d), texto(d, "dispositivo"));
          tostada("¡Dispositivo vinculado! ✨");
        });
        f.addEventListener("change", (ev) => {
          const t = ev.target as HTMLInputElement;
          if (t.name !== "persona" || tocado) return;
          nombreDisp.value = nombrePorDefecto(pareja.personas[t.value as "p1" | "p2"].nombre, navigator.userAgent);
        });
        return h("section", {}, h("h1", {}, "¿Quién eres?"), f);
      }

      case "vincular":
        return h("section", { class: "bienvenida" },
          h("img", { class: "logo-grande", src: "/icono.svg", alt: "" }),
          h("h1", {}, "Te han invitado a Merviri"),
          h("p", { class: "lema" }, "Escribe la contraseña de Merviri para vincular este dispositivo ✨"),
          h("div", { class: "izquierda" },
            formulario([
              campoSecreto("contrasena", "Contraseña", { autocomplete: "current-password" }),
            ], "Vincular", async (d) => {
              const c = texto(d, "contrasena");
              const datos = await abrirVinculo(codigoVinculo!, c);
              const comp = await app.comprobar(datos);
              if (!comp.llavero) throw new Error("En ese repositorio todavía no hay ningún Merviri.");
              ctx.comp = comp;
              ctx.abierta = await abrirConContrasena(comp.llavero.llavero, c);
              ctx.pareja = await app.leerPareja(comp, ctx.abierta);
              ir("quien");
            }, "contrasena"),
          ),
          h("p", { class: "secundario pequeno arriba-mas" },
            "¿No te acuerdas? Pídesela a la otra, o pídele un enlace nuevo."),
        );
    }
  }

  pintar();
  return raiz;
}
