import { VERSION_APP, type Merviri } from "../../app/app";
import { problemaContrasena } from "../../cifrado/llavero";
import { esFecha, fechaLarga, haceCuanto } from "../../dominio/fechas";
import { ID_PAREJA, type Pareja } from "../../dominio/pareja";
import {
  campo,
  campoSecreto,
  conBoton,
  confirmarPeligro,
  copiar,
  descargar,
  dialogo,
  dialogoFormulario,
  h,
  icono,
  tostada,
} from "../dom";
import { elegirPersona, leerPersona, puntoPersona, texto } from "./comunes";

export function vistaAjustes(app: Merviri): HTMLElement {
  return h("section", {},
    h("h1", {}, "Ajustes"),
    tarjetaVosotras(app),
    tarjetaDispositivos(app),
    tarjetaEsteDispositivo(app),
    tarjetaAcceso(app),
    tarjetaSeguridad(app),
    tarjetaAvanzado(app),
  );
}

function formularioEnLinea(hijos: (HTMLElement | null)[], textoBoton: string, enviar: (d: FormData) => Promise<void>) {
  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "submit", class: "boton boton-primario" }, textoBoton);
  const f = h("form", { class: "formulario" }, hijos, error, h("div", {}, boton));
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(boton, () => enviar(new FormData(f)), error);
  });
  return f;
}

function tarjetaVosotras(app: Merviri) {
  const p = app.pareja();
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Vosotras"),
    formularioEnLinea([
      campo("Persona turquesa", h("input", { name: "n1", value: p.personas.p1.nombre, required: true, maxlength: 40 })),
      campo("Persona rosa", h("input", { name: "n2", value: p.personas.p2.nombre, required: true, maxlength: 40 })),
      campo("Juntas desde", h("input", { name: "desde", type: "date", value: p.juntasDesde ?? "" }),
        p.juntasDesde ? `${fechaLarga(p.juntasDesde)}` : "Para contar los días y avisar de los aniversarios."),
    ], "Guardar", async (d) => {
      const desde = texto(d, "desde");
      const nueva: Pareja = {
        id: ID_PAREJA,
        personas: {
          p1: { ...p.personas.p1, nombre: texto(d, "n1").trim() },
          p2: { ...p.personas.p2, nombre: texto(d, "n2").trim() },
        },
        juntasDesde: esFecha(desde) ? desde : null,
      };
      await app.guardarPareja(nueva);
      tostada("Guardado");
    }),
  );
}

function tarjetaDispositivos(app: Merviri) {
  const p = app.pareja();
  const lista = app.dispositivos();
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Dispositivos"),
    lista.length
      ? h("ul", { class: "lista" }, lista.map((d) => {
        const esEste = d.id === app.dispositivo?.id;
        return h("li", {},
          puntoPersona(p, d.persona),
          h("span", { class: "crece" },
            h("b", {}, d.nombre, esEste ? " (este)" : ""),
            h("small", { class: "secundario" }, `${p.personas[d.persona].nombre} · ${esEste ? "ahora" : haceCuanto(d.ultimaVez)}`),
          ),
          app.tokenAlDia(d) ? null : h("span", { class: "pastilla pastilla-aviso" }, "token antiguo"),
          esEste ? null : h("button", {
            type: "button", class: "boton-icono", "aria-label": `Quitar ${d.nombre} de la lista`, title: "Quitar de la lista",
            onclick: async () => {
              if (await confirmarPeligro("Quitar de la lista",
                `Se quita «${d.nombre}» de esta lista. Si ese dispositivo se vuelve a abrir, volverá a aparecer: para quitarle el acceso de verdad, renovad el token y borrad el antiguo en GitHub.`,
                "Quitar")) {
                await app.olvidarOtroDispositivo(d.id);
              }
            },
          }, "✕"),
        );
      }))
      : h("p", { class: "secundario" }, "Todavía no hay ninguno apuntado."),
    h("div", { class: "botones" }, h("a", { class: "boton boton-primario", href: "#vincular-otro" }, "Vincular otro dispositivo")),
  );
}

function tarjetaEsteDispositivo(app: Merviri) {
  const d = app.dispositivo!;
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Este dispositivo"),
    formularioEnLinea([
      elegirPersona(app.pareja(), d.persona),
      campo("Nombre", h("input", { name: "nombre", value: d.nombre, required: true, maxlength: 40 })),
    ], "Guardar", async (f) => {
      await app.guardarEsteDispositivo(leerPersona(f), texto(f, "nombre"));
      tostada("Guardado");
      app.refrescar();
    }),
  );
}

function tarjetaAcceso(app: Merviri) {
  const c = app.conexion;
  const e = app.estadoToken();
  const estado = {
    "sin-fecha": "No sabemos cuándo caduca: renuévalo para guardar la fecha.",
    vigente: "",
    "caduca-pronto": "",
    caducado: "Ha caducado: renuévalo ya.",
  }[e.tipo];
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Acceso a GitHub"),
    c ? h("p", {}, "Repositorio: ", h("b", {}, `${c.propietario}/${c.repositorio}`)) : null,
    c?.caduca ? h("p", {}, "El token caduca el ", h("b", {}, fechaLarga(c.caduca)),
      e.tipo === "vigente" || e.tipo === "caduca-pronto" ? ` (quedan ${e.quedan} días).` : ".") : null,
    estado ? h("p", { class: "error" }, estado) : null,
    h("div", { class: "botones" }, h("a", { class: "boton", href: "#token" }, "Renovar el token")),
  );
}

function tarjetaSeguridad(app: Merviri) {
  const practica = h("input", { type: "checkbox", checked: app.practica?.activa ?? true });
  practica.addEventListener("change", () => void app.activarPractica(practica.checked).then(() => tostada("Guardado")));
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Contraseña y recuperación"),
    app.llavero?.pista ? h("p", { class: "secundario" }, `Pista actual: ${app.llavero.pista}`) : null,
    h("div", { class: "botones" },
      h("button", { type: "button", class: "boton", onclick: () => void cambiarContrasena(app) }, "Cambiar la contraseña"),
      h("button", { type: "button", class: "boton", onclick: () => void nuevoCodigo(app) }, "Nuevo código de recuperación"),
    ),
    h("label", { class: "casilla arriba" }, practica,
      h("span", {}, "Pedirme la contraseña de vez en cuando para no olvidarla (en este dispositivo)")),
  );
}

async function cambiarContrasena(app: Merviri) {
  const ok = await dialogoFormulario("Cambiar la contraseña", [
    h("p", { class: "secundario" }, "La clave de los datos no cambia: los dispositivos ya vinculados siguen funcionando. La nueva contraseña se usará para vincular otros."),
    campoSecreto("actual", "Contraseña actual (o código de recuperación)", { autocomplete: "current-password" }),
    campoSecreto("nueva", "Contraseña nueva", { autocomplete: "new-password", ayuda: "Al menos 10 caracteres." }),
    campoSecreto("repetir", "Repítela", { autocomplete: "new-password" }),
    campo("Pista nueva (opcional)", h("input", { name: "pista", maxlength: 200, value: app.llavero?.pista ?? "" })),
  ], "Cambiar", async (d) => {
    const nueva = texto(d, "nueva");
    const pista = texto(d, "pista").trim() || null;
    if (nueva !== texto(d, "repetir")) throw new Error("Las dos contraseñas no coinciden.");
    const problema = problemaContrasena(nueva, pista);
    if (problema) throw new Error(problema);
    const actual = texto(d, "actual");
    const pareceCodigo = /^[0-9A-Za-z]{4}([\s-]?[0-9A-Za-z]{4}){7}$/.test(actual.trim());
    try {
      await app.cambiarContrasena(actual, nueva, pista, false);
    } catch (e) {
      if (!pareceCodigo) throw e;
      await app.cambiarContrasena(actual, nueva, pista, true);
    }
  });
  if (ok) {
    tostada("Contraseña cambiada");
    app.refrescar();
  }
}

async function nuevoCodigo(app: Merviri) {
  let codigo = "";
  const ok = await dialogoFormulario("Nuevo código de recuperación", [
    h("p", { class: "secundario" }, "El código anterior dejará de servir. Hace falta la contraseña."),
    campoSecreto("contrasena", "Contraseña", { autocomplete: "current-password" }),
  ], "Crear código", async (d) => {
    codigo = await app.nuevoCodigo(texto(d, "contrasena"));
  });
  if (!ok) return;
  await dialogo("Vuestro código nuevo", [
    h("div", { class: "codigo" }, codigo.split("-").map((g) => h("span", {}, g))),
    h("p", { class: "secundario" }, "Guardadlo fuera del móvil (impreso o en un gestor de contraseñas). No se volverá a mostrar."),
    h("div", { class: "botones" },
      h("button", { type: "button", class: "boton", onclick: () => void copiar(codigo, "Código copiado") }, icono("copiar"), "Copiar"),
      h("button", {
        type: "button", class: "boton",
        onclick: () => descargar("merviri-codigo-de-recuperacion.txt", `Código de recuperación de Merviri\n\n${codigo}\n`),
      }, "Guardar en un archivo"),
    ),
  ], [{ texto: "Ya lo he guardado", valor: "ok", tipo: "primario" }]);
}

function tarjetaAvanzado(app: Merviri) {
  const sinc = h("button", { type: "button", class: "boton" }, icono("recargar"), "Sincronizar ahora");
  sinc.addEventListener("click", () => void conBoton(sinc, async () => {
    await app.sincronizar();
    const e = app.estadoSync;
    if (e.tipo === "sincronizado") tostada("Todo al día");
    else if (e.tipo === "pendiente" && e.mensaje) tostada(e.mensaje, "error");
  }));
  return h("div", { class: "tarjeta" },
    h("h2", {}, "Más"),
    h("div", { class: "botones" },
      sinc,
      h("button", {
        type: "button", class: "boton boton-peligro",
        onclick: async () => {
          const pendientes = app.motor?.pendientes() ?? 0;
          const aviso = pendientes
            ? `¡Ojo! Hay ${pendientes} cambio(s) sin enviar que se perderán. `
            : "";
          if (await confirmarPeligro("Olvidar este dispositivo",
            `${aviso}Se borra Merviri de este dispositivo (los datos siguen en GitHub). Para volver a usarlo habrá que vincularlo otra vez.`,
            "Olvidar")) {
            await app.olvidarDispositivo();
            location.hash = "";
          }
        },
      }, "Olvidar este dispositivo"),
    ),
    h("p", { class: "secundario pequeno arriba" }, `Versión ${VERSION_APP}`),
  );
}
