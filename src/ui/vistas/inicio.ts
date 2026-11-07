import type { Merviri } from "../../app/app";
import { fechaLarga, haceCuanto, hoy } from "../../dominio/fechas";
import { rutaElementos, type Elemento } from "../../dominio/listas";
import { contador, esIdPersona, otraPersona } from "../../dominio/pareja";
import { agrupar, esMia, recordatoriosPara, RUTA_TAREAS, type Tarea } from "../../dominio/tareas";
import { campoSecreto, conBoton, h, tostada } from "../dom";
import { tarjetaActivarAvisos } from "./avisos";
import { texto } from "./comunes";
import { eventosDeHoyYProximos, filaEvento } from "./calendario";
import { dibujosSinVer } from "./dibujos";
import { diaLargo } from "./evento";
import { saldoCasa } from "./gastos";
import { listasOrdenadas } from "./listas";
import { filaTarea, marcarHecha } from "./tareas";


const DIA_SEMANA = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "Europe/Madrid" });

export function vistaInicio(app: Merviri): HTMLElement {
  const pareja = app.pareja();
  const yo = pareja.personas[app.persona];
  const otra = otraPersona(app.persona);
  const hoyF = hoy();
  const c = pareja.juntasDesde ? contador(pareja.juntasDesde, hoyF) : null;

  const ultimaDeOtra = app.dispositivos().find((d) => d.persona === otra);
  const tareas = app.lista<Tarea>(RUTA_TAREAS);
  const recordatorios = recordatoriosPara(tareas, app.persona);
  const grupos = agrupar(tareas.filter((t) => esMia(t, app.persona)), hoyF);
  const paraHoy = [...grupos.atrasadas, ...grupos.hoy];
  const nuevos = dibujosSinVer(app);
  const cal = eventosDeHoyYProximos(app);
  const casa = saldoCasa(app);
  const listas = listasOrdenadas(app)
    .map((l) => ({ l, n: app.lista<Elemento>(rutaElementos(l.id)).filter((e) => !e.hecho).length }))
    .filter((x) => x.n > 0)
    .slice(0, 4);

  return h("section", {},
    h("div", { class: "saludo" },
      h("h1", {}, "Hola, ", h("span", { class: `t-${yo.color}` }, yo.nombre), " ✨"),
      h("p", { class: "secundario" }, `${DIA_SEMANA.format(new Date())}, ${fechaLarga(hoyF)}`),
    ),

    recordatorios.map((t) => {
      const de = t.recordatorio && esIdPersona(t.recordatorio.por) ? pareja.personas[t.recordatorio.por].nombre : "";
      return h("div", { class: "tarjeta tarjeta-rosa" },
        h("p", {}, `🔔 ${de} te recuerda: `, h("b", {}, t.titulo)),
        h("div", { class: "botones" },
          h("button", { type: "button", class: "boton boton-primario", onclick: () => void marcarHecha(app, t) }, "¡Hecho!"),
          h("button", {
            type: "button", class: "boton",
            onclick: () => void app.guardar<Tarea>(RUTA_TAREAS, { ...t, recordatorio: { ...t.recordatorio!, visto: new Date().toISOString() } }),
          }, "Vale"),
        ));
    }),

    nuevos.length
      ? h("a", { class: "tarjeta tarjeta-rosa tarjeta-enlace", href: `#dibujo/${nuevos[0]!.id}` },
        h("span", { class: "emoji-grande", "aria-hidden": "true" }, "🎨"),
        h("span", { class: "crece" }, h("b", {}, nuevos.length === 1 ? "Tienes un dibujo nuevo" : `Tienes ${nuevos.length} dibujos nuevos`)),
        h("span", { class: "flecha", "aria-hidden": "true" }, "›"))
      : null,

    tarjetaActivarAvisos(app),

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

    h("div", { class: "cabecera-vista arriba-mas" },
      h("h2", {}, "Hoy"),
      h("a", { class: "enlace-suave", href: "#calendario" }, "Calendario ›")),
    cal.hoy.length ? h("ul", { class: "eventos" }, cal.hoy.map((o) => filaEvento(app, o, hoyF))) : null,
    paraHoy.length
      ? h("ul", { class: `elementos ${cal.hoy.length ? "arriba" : ""}` }, paraHoy.slice(0, 6).map((t) => filaTarea(app, t, hoyF)))
      : null,
    !cal.hoy.length && !paraHoy.length ? h("p", { class: "secundario" }, "Nada apuntado para hoy ✨") : null,
    paraHoy.length > 6 ? h("p", {}, h("a", { class: "enlace-suave", href: "#tareas" }, `Ver las ${paraHoy.length} tareas ›`)) : null,

    h("a", { class: "tarjeta tarjeta-morada tarjeta-enlace arriba-mas", href: "#que-hacemos" },
      h("span", { class: "emoji-grande", "aria-hidden": "true" }, "✨"),
      h("span", { class: "crece" }, h("b", {}, "¿Qué hacemos?"), h("small", {}, "Ideas para vuestros huecos libres, con el tiempo que hará")),
      h("span", { class: "flecha", "aria-hidden": "true" }, "›")),

    cal.proximos.length
      ? [
        h("h2", { class: "arriba-mas" }, "Próximos días"),
        cal.proximos.map(({ dia, ocs }) => h("div", {},
          h("h3", { class: "titulo-seccion" }, diaLargo(dia)),
          h("ul", { class: "eventos" }, ocs.map((o) => filaEvento(app, o, dia))))),
      ]
      : null,

    listas.length
      ? [
        h("h2", { class: "arriba-mas" }, "Listas"),
        h("ul", { class: "tarjetas-lista" }, listas.map(({ l, n }) => h("li", {}, h("a", { class: "tarjeta-enlace", href: `#lista/${l.id}` },
          h("span", { class: "emoji-grande", "aria-hidden": "true" }, l.emoji),
          h("span", { class: "crece" }, h("b", {}, l.nombre), h("small", { class: "secundario" }, `${n} pendiente${n === 1 ? "" : "s"}`)),
          h("span", { class: "flecha", "aria-hidden": "true" }, "›"))))),
      ]
      : null,

    casa ? h("a", { class: "tarjeta-enlace arriba-mas", href: "#bote/casa" },
      h("span", { class: "emoji-grande", "aria-hidden": "true" }, "💶"),
      h("span", { class: "crece" }, h("b", {}, "Gastos de casa"), h("small", { class: "secundario" }, casa.texto)),
      h("span", { class: "flecha", "aria-hidden": "true" }, "›")) : null,

    ultimaDeOtra
      ? h("p", { class: "secundario arriba-mas" },
        h("i", { class: `punto-persona c-${pareja.personas[otra].color}`, "aria-hidden": "true" }), " ",
        `${pareja.personas[otra].nombre} abrió Merviri ${haceCuanto(ultimaDeOtra.ultimaVez)}.`)
      : h("div", { class: "tarjeta tarjeta-rosa" },
        h("p", {}, h("b", {}, `Falta ${pareja.personas[otra].nombre}`)),
        h("p", {}, "Vincula su móvil con un código QR: en Ajustes → Vincular otro dispositivo."),
        h("a", { class: "boton", href: "#vincular-otro" }, "Vincular su móvil")),

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
