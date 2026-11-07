import type { Merviri } from "../../app/app";
import { avisarCapsula, avisarDeseo, avisarRespuesta, avisarResultado, avisarVotacion } from "../../app/eventos";
import { rutaFotos, type Foto } from "../../dominio/album";
import { RUTA_DIBUJOS, type Dibujo } from "../../dominio/dibujos";
import { diasEntre, esFecha, fechaLarga, hoy, sumarDias, type Fecha } from "../../dominio/fechas";
import {
  CAMPOS_SUGERIDOS, LIMITE_RESPUESTA, MAX_OPCIONES, RADAR_DIAS, RUTA_CAPSULAS, RUTA_DESEOS, RUTA_FICHAS, RUTA_RESERVAS, RUTA_VOTACIONES, RUTA_VOTOS,
  capsulaAbierta, deseoVisible, esIdeaSecreta, esParaMi, estadoPregunta, estadoVotacion, fechasCapsula, fichaVacia, idRespuesta, idVoto,
  leerOpciones, limpiarCampos, ordenarDeseos, preguntaDe, problemaCapsula, problemaVotacion, proximoCumple, racha, resumenAnio, rutaRespuestas,
  type Capsula, type CampoFicha, type Deseo, type Ficha, type Reserva, type Respuesta, type Votacion, type Voto,
} from "../../dominio/juntas";
import { contador, esIdPersona, otraPersona, type IdPersona } from "../../dominio/pareja";
import { RUTA_PLANES, type Plan } from "../../dominio/planes";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { anadir, campo, confirmarPeligro, conBoton, dialogo, dialogoFormulario, h, tostada, type Hijo } from "../dom";

/** Vacía un elemento y le pone lo nuevo (admite huecos null). */
const poner = (el: HTMLElement, ...hijos: Hijo[]) => { el.replaceChildren(); anadir(el, hijos); };
import { puntoPersona, texto, volver } from "./comunes";

/**
 * «Nosotras»: pregunta del día, decidir juntas, cápsulas del tiempo, fichas
 * «bueno saber», deseos y nuestro año.
 */

const nombreDe = (app: Merviri, p: IdPersona) => app.pareja().personas[p].nombre;
const colorDe = (app: Merviri, p: IdPersona) => app.pareja().personas[p].color;
const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/** Respuestas de este año y del anterior (para la racha y el historial). */
function respuestas(app: Merviri, hoyF: Fecha = hoy()): Registro<Respuesta>[] {
  const a = +hoyF.slice(0, 4);
  return [...app.lista<Respuesta>(rutaRespuestas(a - 1)), ...app.lista<Respuesta>(rutaRespuestas(a))];
}

const votaciones = (app: Merviri) => app.lista<Votacion>(RUTA_VOTACIONES);
const votos = (app: Merviri) => app.lista<Voto>(RUTA_VOTOS);

/** Votaciones en las que me toca votar. */
export function votacionesPendientes(app: Merviri): Registro<Votacion>[] {
  const vs = votos(app);
  return votaciones(app).filter((v) => !v.cerrada && estadoVotacion(v, vs, app.persona).mio === null);
}

/** Cosas de «Nosotras» que esperan por mí (para la insignia de «Más»). */
export function pendientesNosotras(app: Merviri): number {
  const hoyF = hoy();
  const p = estadoPregunta(respuestas(app, hoyF), hoyF, app.persona);
  return votacionesPendientes(app).length + (p.otraHaContestado && !p.mia ? 1 : 0);
}

const ficha = (app: Merviri, p: IdPersona): Ficha => app.uno<Ficha>(RUTA_FICHAS, p) ?? fichaVacia(p);

/** Cápsulas para mí que se abrieron en la última semana. */
export function capsulasRecienAbiertas(app: Merviri, hoyF = hoy()): Registro<Capsula>[] {
  return app.lista<Capsula>(RUTA_CAPSULAS).filter((c) => esParaMi(c, app.persona) && capsulaAbierta(c, hoyF) && c.abrir >= sumarDias(hoyF, -6));
}

// ---------------------------------------------------------------------------
// Portada de «Nosotras»
// ---------------------------------------------------------------------------

export function vistaNosotras(app: Merviri): HTMLElement {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const pendientes = votacionesPendientes(app).length;
  const vs = votaciones(app).filter((v) => !v.cerrada);
  const caps = app.lista<Capsula>(RUTA_CAPSULAS);
  const paraAbrir = caps.filter((c) => esParaMi(c, yo) && capsulaAbierta(c, hoyF)).length;
  const selladas = caps.filter((c) => !capsulaAbierta(c, hoyF)).length;
  const cumpleOtra = proximoCumple(ficha(app, otra), hoyF);

  const enlace = (href: string, emoji: string, titulo: string, sub: string, clase = "") =>
    h("a", { class: `tarjeta-enlace ${clase}`, href },
      h("span", { class: "emoji-grande", "aria-hidden": "true" }, emoji),
      h("span", { class: "crece" }, h("b", {}, titulo), h("small", { class: "secundario" }, sub)),
      h("span", { class: "flecha", "aria-hidden": "true" }, "›"));

  return h("section", {},
    volver("#mas", "Más"),
    h("h1", {}, "💞 Nosotras"),

    tarjetaPregunta(app, true),

    h("h2", { class: "arriba-mas" }, "Para las dos"),
    h("div", { class: "lista-enlaces" },
      enlace("#decidir", "🗳️", "Decidir juntas",
        pendientes ? `Te toca votar en ${pendientes}` : vs.length ? `${vs.length} abierta${vs.length === 1 ? "" : "s"}` : "Votación secreta: cada una vota sin ver a la otra",
        pendientes ? "tarjeta-rosa" : ""),
      enlace("#capsulas", "💌", "Cápsulas del tiempo",
        paraAbrir ? `${paraAbrir} para abrir` : selladas ? `${selladas} sellada${selladas === 1 ? "" : "s"}` : "Mensajes que no se pueden abrir hasta una fecha"),
      enlace("#nuestro-ano", "🌟", "Nuestro año", "Planes, fotos, preguntas… lo que habéis vivido"),
    ),

    h("h2", { class: "arriba-mas" }, "Bueno saber"),
    h("div", { class: "lista-enlaces" },
      ([yo, otra] as const).map((p) => enlace(`#ficha/${p}`, p === yo ? "🙋" : "💝", p === yo ? "Mi ficha" : `Ficha de ${nombreDe(app, p)}`,
        p === yo ? "Tallas, gustos, alergias… para que ella lo tenga a mano" : "Tallas, gustos, alergias, su cumple…")),
    ),

    h("h2", { class: "arriba-mas" }, "Deseos y regalos"),
    h("div", { class: "lista-enlaces" },
      enlace(`#deseos/${yo}`, "🌠", "Mis deseos", "Lo que te hace ilusión. No verás si alguien se lo ha «pedido»"),
      enlace(`#deseos/${otra}`, "🎁", `Deseos de ${nombreDe(app, otra)}`,
        cumpleOtra && cumpleOtra.faltan <= RADAR_DIAS
          ? cumpleOtra.faltan === 0 ? "🎂 ¡Hoy es su cumple!" : `🎂 Su cumple es en ${cumpleOtra.faltan} día${cumpleOtra.faltan === 1 ? "" : "s"}`
          : "Y tus ideas de regalo secretas",
        cumpleOtra && cumpleOtra.faltan <= RADAR_DIAS ? "tarjeta-rosa" : ""),
    ),
  );
}

// ---------------------------------------------------------------------------
// Pregunta del día
// ---------------------------------------------------------------------------

/** Lo escrito y aún no enviado (por si la pantalla se redibuja). */
const borradores = new Map<Fecha, string>();

function formularioRespuesta(app: Merviri, dia: Fecha, previa: string, alTerminar?: () => void): HTMLElement {
  const area = h("textarea", { name: "respuesta", rows: 3, maxlength: LIMITE_RESPUESTA, placeholder: "Tu respuesta…", "aria-label": "Tu respuesta", required: true },
    borradores.get(dia) ?? previa);
  area.addEventListener("input", () => borradores.set(dia, area.value));
  const error = h("p", { class: "error", role: "alert" });
  const boton = h("button", { type: "submit", class: "boton boton-primario" }, previa ? "Guardar" : "Contestar");
  const f = h("form", { class: "formulario arriba" }, area, error, h("div", { class: "botones" }, boton,
    alTerminar ? h("button", { type: "button", class: "boton", onclick: alTerminar }, "Cancelar") : null));
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    void conBoton(boton, async () => {
      const t = area.value.trim();
      if (!t) throw new Error("Escribe algo ✨");
      const antes = estadoPregunta(respuestas(app, dia), dia, app.persona);
      await app.guardar<Respuesta>(rutaRespuestas(dia.slice(0, 4)), { id: idRespuesta(dia, app.persona), fecha: dia, persona: app.persona, texto: t });
      borradores.delete(dia);
      if (!antes.mia) avisarRespuesta(app, dia, antes.otraHaContestado);
      alTerminar?.();
      app.refrescar();
    }, error);
  });
  return f;
}

function burbuja(app: Merviri, p: IdPersona, t: string): HTMLElement {
  return h("div", { class: `respuesta respuesta-${colorDe(app, p)}` },
    h("small", {}, puntoPersona(app.pareja(), p), " ", nombreDe(app, p)),
    h("p", {}, t));
}

/** La pregunta de hoy, para contestar ahí mismo. */
export function tarjetaPregunta(app: Merviri, completa = false): HTMLElement | null {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const rs = respuestas(app, hoyF);
  const e = estadoPregunta(rs, hoyF, yo);
  const r = racha(rs, hoyF);
  let editando = false;
  const caja = h("div", { class: "tarjeta tarjeta-morada pregunta-dia" });
  const pintar = () => {
    poner(caja,
      h("div", { class: "cabecera-vista" },
        h("small", { class: "etiqueta-pregunta" }, "💬 Pregunta del día"),
        r ? h("small", { class: "pastilla pastilla-rosa", title: "Días seguidos contestando las dos" }, `🔥 ${r}`) : null),
      h("p", { class: "texto-pregunta" }, preguntaDe(hoyF).texto),
      e.mia && !editando ? burbuja(app, yo, e.mia.texto) : null,
      e.mia && e.suya ? burbuja(app, otra, e.suya.texto) : null,
      e.mia && !e.suya ? h("p", { class: "pequeno" }, `Cuando ${nombreDe(app, otra)} conteste, verás su respuesta aquí ✨`) : null,
      !e.mia && e.otraHaContestado ? h("p", { class: "pequeno" }, h("b", {}, `${nombreDe(app, otra)} ya ha contestado.`), " Contesta tú para ver su respuesta 👀") : null,
      !e.mia || editando ? formularioRespuesta(app, hoyF, e.mia?.texto ?? "", editando ? () => { editando = false; pintar(); } : undefined) : null,
      h("div", { class: "botones" },
        e.mia && !editando ? h("button", { type: "button", class: "enlace-boton", onclick: () => { editando = true; pintar(); } }, "Editar mi respuesta") : null,
        completa ? h("a", { class: "enlace-suave", href: "#pregunta" }, "Días anteriores ›") : h("a", { class: "enlace-suave", href: "#nosotras" }, "Nosotras ›")),
    );
  };
  pintar();
  return caja;
}

export function vistaPreguntas(app: Merviri): HTMLElement {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const rs = respuestas(app, hoyF);
  const dias = [...new Set(rs.map((r) => r.fecha))].filter((f) => esFecha(f) && f < hoyF).sort().reverse().slice(0, 120);
  const abierto = new Set<Fecha>();

  const lista = h("div", { class: "historial-preguntas" });
  const pintar = () => poner(lista, ...dias.map((dia) => {
    const e = estadoPregunta(rs, dia, yo);
    return h("div", { class: "tarjeta" },
      h("small", { class: "secundario" }, fechaLarga(dia)),
      h("p", { class: "texto-pregunta" }, preguntaDe(dia).texto),
      e.mia ? burbuja(app, yo, e.mia.texto) : null,
      e.suya ? burbuja(app, otra, e.suya.texto) : null,
      e.mia && !e.otraHaContestado ? h("p", { class: "secundario pequeno" }, `${nombreDe(app, otra)} no contestó.`) : null,
      !e.mia && abierto.has(dia) ? formularioRespuesta(app, dia, "", () => { abierto.delete(dia); pintar(); }) : null,
      !e.mia && !abierto.has(dia)
        ? h("button", { type: "button", class: "boton boton-pequeno", onclick: () => { abierto.add(dia); pintar(); } },
          e.otraHaContestado ? `Contestar para ver la de ${nombreDe(app, otra)} 👀` : "Contestar")
        : null);
  }));
  pintar();

  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("h1", {}, "💬 Pregunta del día"),
    tarjetaPregunta(app, true),
    dias.length ? h("h2", { class: "arriba-mas" }, "Días anteriores") : null,
    dias.length ? lista : h("p", { class: "secundario arriba" }, "Cada día hay una pregunta nueva, la misma para las dos. La respuesta de la otra se descubre cuando contestas tú."),
  );
}

// ---------------------------------------------------------------------------
// Decidir juntas
// ---------------------------------------------------------------------------

async function nuevaVotacion(app: Merviri) {
  const pregunta = h("input", { name: "pregunta", maxlength: 120, required: true, placeholder: "¿Dónde cenamos el sábado?" });
  const opciones = h("textarea", { name: "opciones", rows: 4, placeholder: "Japonés\nPizza\nEn casa" });
  let id = "";
  const ok = await dialogoFormulario("Decidir juntas", [
    campo("¿Qué tenéis que decidir?", pregunta),
    campo("Opciones (una por línea)", opciones, `Entre 2 y ${MAX_OPCIONES}. Cada una vota sin ver lo que ha votado la otra.`),
  ], "Crear", async (d) => {
    const p = texto(d, "pregunta").trim();
    const ops = leerOpciones(texto(d, "opciones"));
    const problema = problemaVotacion(p, ops);
    if (problema) throw new Error(problema);
    id = nuevoId();
    const v: Votacion = { id, pregunta: p, opciones: ops, desempate: null, cerrada: false };
    await app.guardar<Votacion>(RUTA_VOTACIONES, v);
    avisarVotacion(app, v);
  });
  if (ok) location.hash = `#votacion/${id}`;
}

export function vistaDecidir(app: Merviri): HTMLElement {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const vs = votos(app);
  const todas = votaciones(app).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
  const abiertas = todas.filter((v) => !v.cerrada);
  const cerradas = todas.filter((v) => v.cerrada).slice(0, 20);
  const fila = (v: Registro<Votacion>) => {
    const e = estadoVotacion(v, vs, yo);
    const estado = e.mio === null ? h("span", { class: "pastilla pastilla-rosa" }, "Te toca votar")
      : !e.completa ? h("span", { class: "pastilla pastilla-morado" }, `Esperando a ${nombreDe(app, otra)}`)
      : e.ganadora !== null ? h("span", { class: "pastilla pastilla-turquesa" }, `✔ ${v.opciones[e.ganadora]}`)
      : h("span", { class: "pastilla pastilla-aviso" }, "No coincidís");
    return h("li", {}, h("a", { class: "elemento en-fila", href: `#votacion/${v.id}` }, h("span", { class: "crece" }, v.pregunta), estado));
  };
  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "🗳️ Decidir juntas"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void nuevaVotacion(app) }, "+ Nueva")),
    abiertas.length ? h("ul", { class: "elementos" }, abiertas.map(fila))
      : h("p", { class: "secundario" }, "¿Peli, cena, destino…? Poned las opciones y votad cada una sin ver a la otra. Cuando votéis las dos, se descubre. Si no coincidís, que decida el azar 🎲"),
    cerradas.length ? [h("h2", { class: "arriba-mas" }, "Archivadas"), h("ul", { class: "elementos" }, cerradas.map(fila))] : null,
  );
}

export function vistaVotacion(app: Merviri, id: string): HTMLElement {
  const v = app.uno<Votacion>(RUTA_VOTACIONES, id);
  if (!v) return h("section", {}, volver("#decidir", "Decidir juntas"), h("p", { class: "secundario" }, "Esta votación ya no existe."));
  const yo = app.persona;
  const otra = otraPersona(yo);
  const vs = votos(app);
  const e = estadoVotacion(v, vs, yo);
  let cambiando = false;

  const votar = async (opcion: number) => {
    const antes = estadoVotacion(v, votos(app), yo);
    await app.guardar<Voto>(RUTA_VOTOS, { id: idVoto(v.id, yo), votacion: v.id, persona: yo, opcion });
    if (antes.otraHaVotado && antes.mio === null) avisarResultado(app, v);
    app.refrescar();
  };

  const cuerpo = h("div", {});
  const pintar = () => {
    if (e.mio === null || cambiando) {
      poner(cuerpo,
        h("p", { class: "secundario" }, e.otraHaVotado ? `${nombreDe(app, otra)} ya ha votado (en secreto). Te toca:` : "Tu voto es secreto hasta que votéis las dos."),
        h("div", { class: "botones-columna" }, v.opciones.map((o, i) =>
          h("button", { type: "button", class: `boton opcion-voto ${e.mio === i ? "elegida" : ""}`, onclick: () => void votar(i) }, o))),
        cambiando ? h("button", { type: "button", class: "enlace-boton arriba", onclick: () => { cambiando = false; pintar(); } }, "Cancelar") : null,
      );
      return;
    }
    if (!e.completa) {
      poner(cuerpo,
        h("div", { class: "tarjeta tarjeta-morada" },
          h("p", {}, "Has votado: ", h("b", {}, v.opciones[e.mio]!)),
          h("p", { class: "pequeno" }, `Esperando a ${nombreDe(app, otra)}… Cuando vote, os llegará el resultado a las dos.`)),
        h("button", { type: "button", class: "enlace-boton", onclick: () => { cambiando = true; pintar(); } }, "Cambiar mi voto"),
      );
      return;
    }
    const sorteo = async () => {
      const elegida = Math.random() < 0.5 ? e.mio! : e.suyo!;
      await app.guardar<Votacion>(RUTA_VOTACIONES, { id: v.id, pregunta: v.pregunta, opciones: v.opciones, cerrada: v.cerrada, desempate: elegida });
      tostada(`🎲 ¡Ha salido «${v.opciones[elegida]}»!`);
    };
    poner(cuerpo,
      e.ganadora !== null
        ? h("div", { class: "tarjeta tarjeta-morada resultado-voto" },
          h("div", { class: "emoji-grande" }, e.coinciden ? "🎉" : "🎲"),
          h("p", {}, e.coinciden ? "¡Coincidís!" : "Ha decidido el azar:"),
          h("p", { class: "ganadora" }, v.opciones[e.ganadora]!))
        : h("div", { class: "tarjeta tarjeta-rosa" },
          h("p", {}, h("b", {}, "No coincidís 🙈")),
          h("button", { type: "button", class: "boton boton-primario arriba", onclick: (ev: Event) => void conBoton(ev.currentTarget as HTMLButtonElement, sorteo) }, "🎲 Que decida el azar")),
      h("ul", { class: "elementos arriba" }, ([yo, otra] as const).map((p) => h("li", {}, h("span", { class: "elemento en-fila" },
        puntoPersona(app.pareja(), p), h("span", { class: "crece" }, nombreDe(app, p)), h("b", {}, v.opciones[(p === yo ? e.mio : e.suyo)!]!))))),
    );
  };
  pintar();

  return h("section", {},
    volver("#decidir", "Decidir juntas"),
    h("h1", {}, v.pregunta),
    cuerpo,
    h("div", { class: "botones arriba-mas" },
      h("button", {
        type: "button", class: "boton",
        onclick: () => void app.guardar<Votacion>(RUTA_VOTACIONES, { id: v.id, pregunta: v.pregunta, opciones: v.opciones, desempate: v.desempate, cerrada: !v.cerrada }).then(() => { location.hash = "#decidir"; }),
      }, v.cerrada ? "Reabrir" : "Archivar"),
      h("button", {
        type: "button", class: "boton boton-peligro",
        onclick: async () => {
          if (!(await confirmarPeligro("Borrar la votación", "Se borra para las dos, con los votos.", "Borrar"))) return;
          for (const p of ["p1", "p2"] as const) if (app.uno<Voto>(RUTA_VOTOS, idVoto(v.id, p))) await app.borrar(RUTA_VOTOS, idVoto(v.id, p));
          await app.borrar(RUTA_VOTACIONES, v.id);
          location.hash = "#decidir";
        },
      }, "Borrar")),
  );
}

// ---------------------------------------------------------------------------
// Cápsulas del tiempo
// ---------------------------------------------------------------------------

async function nuevaCapsula(app: Merviri) {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const fecha = h("input", { type: "date", name: "abrir", required: true, min: sumarDias(hoyF, 1), value: sumarDias(hoyF, 365) });
  const rapidas = h("div", { class: "fichas" }, fechasCapsula(hoyF, app.pareja().juntasDesde).map((x) =>
    h("button", { type: "button", class: "ficha", onclick: () => { fecha.value = x.fecha; } }, x.texto)));
  const para = h("select", { name: "para" },
    h("option", { value: otra }, `Para ${nombreDe(app, otra)}`),
    h("option", { value: "ambas" }, "Para las dos"),
    h("option", { value: yo }, "Para mí (yo del futuro)"));
  await dialogoFormulario("💌 Cápsula del tiempo", [
    campo("Título", h("input", { name: "titulo", maxlength: 80, required: true, placeholder: "Para dentro de un año" })),
    campo("Destinataria", para),
    campo("Se abre el", h("div", {}, fecha, rapidas)),
    campo("Mensaje", h("textarea", { name: "mensaje", rows: 6, maxlength: 5000, required: true, placeholder: `Querida ${nombreDe(app, otra)} del futuro…` }),
      "Queda sellada: nadie (ni tú) podrá leerla hasta ese día. Ese día os llega un aviso."),
  ], "Sellar", async (d) => {
    const p = texto(d, "para");
    const c: Capsula = {
      id: nuevoId(), titulo: texto(d, "titulo").trim(), mensaje: texto(d, "mensaje").trim(), abrir: texto(d, "abrir"),
      para: p === "ambas" ? "ambas" : esIdPersona(p) ? p : otra,
    };
    const problema = problemaCapsula(c, hoyF);
    if (problema) throw new Error(problema);
    await app.guardar<Capsula>(RUTA_CAPSULAS, c);
    avisarCapsula(app, c);
    tostada("💌 Cápsula sellada");
  });
}

const paraQuien = (app: Merviri, c: Capsula) => (c.para === "ambas" ? "las dos" : c.para === app.persona ? "ti" : nombreDe(app, c.para));

export function vistaCapsulas(app: Merviri): HTMLElement {
  const yo = app.persona;
  const hoyF = hoy();
  const todas = app.lista<Capsula>(RUTA_CAPSULAS);
  const abiertas = todas.filter((c) => capsulaAbierta(c, hoyF) && (esParaMi(c, yo) || c.por === yo)).sort((a, b) => b.abrir.localeCompare(a.abrir));
  const selladas = todas.filter((c) => !capsulaAbierta(c, hoyF)).sort((a, b) => a.abrir.localeCompare(b.abrir));
  const autora = (c: Registro<Capsula>) => (esIdPersona(c.por) ? (c.por === yo ? "Tú" : nombreDe(app, c.por)) : "");

  const abrir = (c: Registro<Capsula>) => void dialogo(`💌 ${c.titulo}`, [
    h("p", { class: "secundario pequeno" }, `De ${autora(c).toLowerCase() === "tú" ? "ti" : autora(c)} para ${paraQuien(app, c)} · sellada el ${fechaLarga(c.actualizado.slice(0, 10))}`),
    h("p", { class: "mensaje-capsula" }, c.mensaje),
  ], [{ texto: "Cerrar", valor: "ok", tipo: "primario" }]);

  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "💌 Cápsulas"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void nuevaCapsula(app) }, "+ Nueva")),
    !todas.length ? h("p", { class: "secundario" }, "Escribe un mensaje y elige cuándo se podrá abrir: dentro de un año, en vuestro aniversario… Hasta entonces queda sellado para las dos.") : null,
    abiertas.length ? [
      h("h2", {}, "Para abrir"),
      h("ul", { class: "elementos" }, abiertas.map((c) => h("li", {},
        h("button", { type: "button", class: "elemento en-fila", onclick: () => abrir(c) },
          h("span", { class: "crece" }, h("b", {}, `💌 ${c.titulo}`), h("small", { class: "secundario bloque" }, `${autora(c)} → ${paraQuien(app, c)} · ${fechaLarga(c.abrir)}`)),
          h("span", { class: "flecha", "aria-hidden": "true" }, "›"))))),
    ] : null,
    selladas.length ? [
      h("h2", { class: "arriba-mas" }, "Selladas"),
      h("ul", { class: "elementos" }, selladas.map((c) => {
        const faltan = diasEntre(hoyF, c.abrir);
        return h("li", {},
          h("span", { class: "elemento" },
            h("span", { class: "crece" }, h("b", {}, `🔒 ${c.titulo}`),
              h("small", { class: "secundario bloque" }, `${autora(c)} → ${paraQuien(app, c)} · se abre el ${fechaLarga(c.abrir)} (${faltan === 1 ? "mañana" : `faltan ${faltan.toLocaleString("es-ES")} días`})`))),
          c.por === yo ? h("button", {
            type: "button", class: "boton-icono", "aria-label": "Borrar la cápsula", title: "Borrar",
            onclick: async () => { if (await confirmarPeligro("Borrar la cápsula", "Se borra sin abrirse.", "Borrar")) await app.borrar(RUTA_CAPSULAS, c.id); },
          }, "🗑️") : null);
      })),
    ] : null,
  );
}

// ---------------------------------------------------------------------------
// Fichas «bueno saber»
// ---------------------------------------------------------------------------

export function vistaFicha(app: Merviri, p: IdPersona): HTMLElement {
  const yo = app.persona;
  const f = ficha(app, p);
  const hoyF = hoy();
  const cumple = proximoCumple(f, hoyF);
  let editando = false;
  const cuerpo = h("div", {});

  const editar = () => {
    const filas: { etiqueta: HTMLInputElement; valor: HTMLInputElement }[] = [];
    const contenedor = h("div", { class: "campos-ficha" });
    const lista = h("datalist", { id: "campos-sugeridos" }, CAMPOS_SUGERIDOS.map((c) => h("option", { value: c })));
    const fila = (c: CampoFicha) => {
      const etiqueta = h("input", { value: c.etiqueta, maxlength: 60, placeholder: "Talla de zapato", list: "campos-sugeridos", "aria-label": "Qué" });
      const valor = h("input", { value: c.valor, maxlength: 300, placeholder: "38", "aria-label": "Valor" });
      const par = { etiqueta, valor };
      filas.push(par);
      const el = h("div", { class: "fila-campo" }, etiqueta, valor,
        h("button", { type: "button", class: "boton-icono", "aria-label": "Quitar", onclick: () => { filas.splice(filas.indexOf(par), 1); el.remove(); } }, "✕"));
      contenedor.append(el);
    };
    (f.campos.length ? f.campos : CAMPOS_SUGERIDOS.slice(0, 4).map((e) => ({ etiqueta: e, valor: "" }))).forEach(fila);
    const fechaCumple = h("input", { type: "date", value: f.cumple ?? "", max: hoyF, name: "cumple" });
    const guardar = h("button", { type: "button", class: "boton boton-primario" }, "Guardar");
    const error = h("p", { class: "error", role: "alert" });
    guardar.addEventListener("click", () => void conBoton(guardar, async () => {
      const c = fechaCumple.value;
      await app.guardar<Ficha>(RUTA_FICHAS, {
        id: p, cumple: esFecha(c) ? c : null,
        campos: limpiarCampos(filas.map((x) => ({ etiqueta: x.etiqueta.value, valor: x.valor.value }))),
      });
      editando = false;
      tostada("Ficha guardada ✨");
      app.refrescar();
    }, error));
    poner(cuerpo,
      campo("Cumpleaños", fechaCumple),
      h("h2", { class: "arriba-mas" }, "Bueno saber"),
      lista, contenedor,
      h("button", { type: "button", class: "boton boton-pequeno arriba", onclick: () => fila({ etiqueta: "", valor: "" }) }, "+ Añadir"),
      error,
      h("div", { class: "botones arriba-mas" }, guardar, h("button", { type: "button", class: "boton", onclick: () => { editando = false; pintar(); } }, "Cancelar")),
    );
  };

  const pintar = () => {
    if (editando) { editar(); return; }
    poner(cuerpo,
      cumple ? h("div", { class: "tarjeta tarjeta-rosa" },
        h("p", {}, "🎂 ", h("b", {}, fechaLarga(f.cumple!).replace(/ de \d{4}$/, "")),
          cumple.faltan === 0 ? " · ¡Hoy! 🎉" : ` · cumple ${cumple.anios} en ${cumple.faltan} día${cumple.faltan === 1 ? "" : "s"}`)) : null,
      f.campos.length
        ? h("dl", { class: "ficha-datos" }, f.campos.map((c) => [h("dt", {}, c.etiqueta), h("dd", {}, c.valor)]))
        : h("p", { class: "secundario" }, p === yo
          ? "Apunta tus tallas, lo que te gusta y lo que no… Así ella lo tiene siempre a mano para un regalo o una sorpresa."
          : `Tallas, gustos, alergias de ${nombreDe(app, p)}… Lo podéis rellenar las dos.`),
      h("div", { class: "botones arriba" },
        h("button", { type: "button", class: "boton", onclick: () => { editando = true; pintar(); } }, "✏️ Editar"),
        h("a", { class: "boton", href: `#deseos/${p}` }, p === yo ? "🌠 Mis deseos" : "🎁 Sus deseos")),
    );
  };
  pintar();

  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("h1", {}, p === yo ? "🙋 Mi ficha" : h("span", {}, "💝 ", h("span", { class: `t-${colorDe(app, p)}` }, nombreDe(app, p)))),
    cuerpo,
  );
}

// ---------------------------------------------------------------------------
// Deseos
// ---------------------------------------------------------------------------

async function editarDeseo(app: Merviri, de: IdPersona, previo: Deseo | null) {
  const secreta = de !== app.persona;
  await dialogoFormulario(previo ? "Editar" : secreta ? `🤫 Idea de regalo para ${nombreDe(app, de)}` : "🌠 Nuevo deseo", [
    campo("¿Qué?", h("input", { name: "titulo", maxlength: 120, required: true, value: previo?.titulo ?? "", placeholder: "Unas zapatillas de correr" })),
    campo("Enlace (opcional)", h("input", { name: "enlace", type: "url", maxlength: 500, value: previo?.enlace ?? "", placeholder: "https://…" })),
    campo("Precio aproximado (opcional)", h("input", { name: "precio", maxlength: 30, value: previo?.precio ?? "", placeholder: "40 €" })),
    h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "mucho", checked: previo?.mucho ?? false }), " ❤️ Me hace muchísima ilusión"),
    secreta && !previo ? h("p", { class: "ayuda" }, `${nombreDe(app, de)} no verá esta idea.`) : null,
  ], "Guardar", async (d) => {
    const titulo = texto(d, "titulo").trim();
    if (!titulo) throw new Error("Escribe qué es.");
    const enlace = texto(d, "enlace").trim();
    if (enlace && !/^https?:\/\//i.test(enlace)) throw new Error("El enlace tiene que empezar por https://");
    const nuevo: Deseo = {
      id: previo?.id ?? nuevoId(), de, titulo, enlace: enlace || null, precio: texto(d, "precio").trim() || null,
      mucho: d.get("mucho") === "on", conseguido: previo?.conseguido ?? false,
    };
    await app.guardar<Deseo>(RUTA_DESEOS, nuevo);
    if (!previo) avisarDeseo(app, nuevo);
  });
}

export function vistaDeseos(app: Merviri, p: IdPersona): HTMLElement {
  const yo = app.persona;
  const mios = p === yo;
  const hoyF = hoy();
  const lista = ordenarDeseos(app.lista<Deseo>(RUTA_DESEOS).filter((d) => d.de === p && deseoVisible(d, yo)));
  const reservas = app.lista<Reserva>(RUTA_RESERVAS);
  const cumple = mios ? null : proximoCumple(ficha(app, p), hoyF);

  const fila = (d: Registro<Deseo>) => {
    const reservado = !mios && reservas.some((r) => r.id === d.id && r.quien === yo);
    // Cada deseo lo edita y lo borra quien lo apuntó.
    const mioDeVerdad = d.por === yo;
    return h("li", { class: d.conseguido ? "hecho" : "" },
      h(mioDeVerdad ? "button" : "span", mioDeVerdad ? { type: "button", class: "elemento", onclick: () => void editarDeseo(app, p, d) } : { class: "elemento" },
        h("span", { class: "crece" },
          h("span", {}, `${d.mucho ? "❤️ " : ""}${d.titulo}`),
          h("small", { class: "secundario bloque" }, [d.precio, esIdeaSecreta(d) ? "🤫 idea tuya, ella no la ve" : null, reservado ? "🎁 te lo has pedido tú" : null].filter(Boolean).join(" · "))),
      ),
      d.enlace ? h("a", { class: "boton-icono", href: d.enlace, target: "_blank", rel: "noopener noreferrer", "aria-label": "Abrir el enlace", title: "Abrir el enlace" }, "🔗") : null,
      mios
        ? h("button", {
          type: "button", class: "boton boton-pequeno",
          onclick: () => void app.guardar<Deseo>(RUTA_DESEOS, { id: d.id, de: d.de, titulo: d.titulo, enlace: d.enlace, precio: d.precio, mucho: d.mucho, conseguido: !d.conseguido }),
        }, d.conseguido ? "Desmarcar" : "¡Ya lo tengo!")
        : d.conseguido ? null
        : h("button", {
          type: "button", class: `boton boton-pequeno ${reservado ? "" : "boton-primario"}`,
          onclick: () => void (reservado ? app.borrar(RUTA_RESERVAS, d.id) : app.guardar<Reserva>(RUTA_RESERVAS, { id: d.id, quien: yo })),
        }, reservado ? "Soltar" : "🎁 Me lo pido"),
      mioDeVerdad ? h("button", {
        type: "button", class: "boton-icono", "aria-label": "Borrar", title: "Borrar",
        onclick: async () => {
          if (!(await confirmarPeligro("Borrar", `«${d.titulo}»`, "Borrar"))) return;
          await app.borrar(RUTA_DESEOS, d.id);
          if (app.uno<Reserva>(RUTA_RESERVAS, d.id)) await app.borrar(RUTA_RESERVAS, d.id);
        },
      }, "🗑️") : null,
    );
  };

  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, mios ? "🌠 Mis deseos" : h("span", {}, "🎁 Deseos de ", h("span", { class: `t-${colorDe(app, p)}` }, nombreDe(app, p)))),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarDeseo(app, p, null) }, mios ? "+ Deseo" : "+ Idea")),
    cumple && cumple.faltan <= RADAR_DIAS
      ? h("div", { class: "tarjeta tarjeta-rosa" }, h("p", {}, cumple.faltan === 0 ? `🎂 ¡Hoy es el cumple de ${nombreDe(app, p)}!` : `🎂 Su cumple es en ${cumple.faltan} día${cumple.faltan === 1 ? "" : "s"} (${fechaLarga(cumple.fecha)})`))
      : null,
    h("p", { class: "secundario pequeno" }, mios
      ? `Lo que te hace ilusión. ${nombreDe(app, otraPersona(yo))} puede «pedírselo» para regalártelo, pero tú no lo verás 🤫`
      : `«Me lo pido» lo ves solo tú, para no repetir regalo. Las ideas que apuntes aquí son secretas: ${nombreDe(app, p)} no las ve.`),
    lista.length ? h("ul", { class: "elementos deseos" }, lista.map(fila))
      : h("p", { class: "secundario arriba" }, mios ? "Aún no hay deseos. ¡Apunta el primero!" : `${nombreDe(app, p)} aún no ha apuntado deseos.`),
    h("p", { class: "arriba" }, h("a", { class: "enlace-suave", href: `#ficha/${p}` }, mios ? "Mi ficha (tallas, gustos…) ›" : `Ficha de ${nombreDe(app, p)} (tallas, gustos…) ›`)),
  );
}

// ---------------------------------------------------------------------------
// Nuestro año
// ---------------------------------------------------------------------------

export function vistaNuestroAnio(app: Merviri, param: string): HTMLElement {
  const hoyF = hoy();
  const actual = +hoyF.slice(0, 4);
  const anio = /^\d{4}$/.test(param) && +param <= actual && +param >= 2000 ? +param : actual;
  const r = resumenAnio(anio, {
    planes: app.lista<Plan>(RUTA_PLANES),
    fotos: app.lista<Foto>(rutaFotos(`${anio}-01-01`)),
    respuestas: app.lista<Respuesta>(rutaRespuestas(anio)),
    dibujos: app.lista<Dibujo>(RUTA_DIBUJOS),
    votaciones: votaciones(app),
    votos: votos(app),
    capsulas: app.lista<Capsula>(RUTA_CAPSULAS),
  });
  const pareja = app.pareja();
  const c = pareja.juntasDesde ? contador(pareja.juntasDesde, anio === actual ? hoyF : `${anio}-12-31`) : null;
  const dato = (n: number | string, etiqueta: string, emoji: string) =>
    h("div", { class: "dato-anio" }, h("span", { class: "emoji", "aria-hidden": "true" }, emoji), h("b", {}, typeof n === "number" ? n.toLocaleString("es-ES") : n), h("small", {}, etiqueta));
  const desde = pareja.juntasDesde && esFecha(pareja.juntasDesde) ? +pareja.juntasDesde.slice(0, 4) : actual - 1;
  const anios = Array.from({ length: Math.min(actual - Math.min(desde, actual) + 1, 10) }, (_, i) => actual - i);

  return h("section", {},
    volver("#nosotras", "Nosotras"),
    h("h1", {}, `🌟 Nuestro ${anio}`),
    anios.length > 1 ? h("div", { class: "fichas" }, anios.map((a) =>
      h("a", { class: "ficha", href: `#nuestro-ano/${a}`, "aria-pressed": String(a === anio) }, String(a)))) : null,
    c ? h("div", { class: "tarjeta tarjeta-morada contador" },
      h("div", { class: "numero" }, c.dias.toLocaleString("es-ES")),
      h("div", { class: "etiqueta" }, anio === actual ? "días juntas (y contando)" : `días juntas a final de ${anio}`)) : null,
    h("div", { class: "datos-anio arriba" },
      dato(r.planes.length, r.planes.length === 1 ? "plan hecho" : "planes hechos", "✨"),
      dato(r.fotos, r.fotos === 1 ? "foto" : "fotos", "📷"),
      dato(r.preguntas, r.preguntas === 1 ? "pregunta contestada juntas" : "preguntas contestadas juntas", "💬"),
      dato(r.dibujos, r.dibujos === 1 ? "dibujo" : "dibujos", "🎨"),
      dato(r.decisiones, r.decisiones === 1 ? "decisión juntas" : "decisiones juntas", "🗳️"),
      dato(r.capsulas, r.capsulas === 1 ? "cápsula sellada" : "cápsulas selladas", "💌"),
    ),
    r.mesFotos ? h("p", { class: "arriba" }, "📷 El mes con más fotos: ", h("a", { href: "#album" }, MES.format(new Date(`${r.mesFotos}-01T12:00:00Z`)))) : null,
    r.planes.length ? [h("h2", { class: "arriba-mas" }, "Lo que habéis hecho"), h("ul", { class: "lista-planes-anio" }, r.planes.map((t) => h("li", {}, `✨ ${t}`)))]
      : h("p", { class: "secundario arriba" }, "Cuando marquéis planes como «¡Hecho!», aparecerán aquí."),
  );
}

// ---------------------------------------------------------------------------
// En la portada de la app
// ---------------------------------------------------------------------------

/** Cumpleaños cerca (el de la otra, para el regalo) o hoy (el de cualquiera). */
export function tarjetaCumple(app: Merviri): HTMLElement | null {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const mio = proximoCumple(ficha(app, yo), hoyF);
  if (mio?.faltan === 0) return h("div", { class: "tarjeta tarjeta-rosa" }, h("p", {}, h("b", {}, `🎂 ¡Feliz cumpleaños, ${nombreDe(app, yo)}!`), " ✨"));
  const suyo = proximoCumple(ficha(app, otra), hoyF);
  if (!suyo || suyo.faltan > RADAR_DIAS) return null;
  return h("a", { class: "tarjeta-enlace tarjeta-rosa", href: `#deseos/${otra}` },
    h("span", { class: "emoji-grande", "aria-hidden": "true" }, suyo.faltan === 0 ? "🎂" : "🎁"),
    h("span", { class: "crece" },
      h("b", {}, suyo.faltan === 0 ? `¡Hoy es el cumple de ${nombreDe(app, otra)}!` : `El cumple de ${nombreDe(app, otra)} es en ${suyo.faltan} día${suyo.faltan === 1 ? "" : "s"}`),
      h("small", {}, "Ver sus deseos")),
    h("span", { class: "flecha", "aria-hidden": "true" }, "›"));
}

export function tarjetaCapsulas(app: Merviri): HTMLElement | null {
  const n = capsulasRecienAbiertas(app).length;
  if (!n) return null;
  return h("a", { class: "tarjeta-enlace tarjeta-rosa", href: "#capsulas" },
    h("span", { class: "emoji-grande", "aria-hidden": "true" }, "💌"),
    h("span", { class: "crece" }, h("b", {}, n === 1 ? "Se ha abierto una cápsula del tiempo" : `Se han abierto ${n} cápsulas del tiempo`), h("small", {}, "Ábrela")),
    h("span", { class: "flecha", "aria-hidden": "true" }, "›"));
}
