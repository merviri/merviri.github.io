import type { Merviri } from "../../app/app";
import { avisarEvento, avisarPlan } from "../../app/eventos";
import type { Evento } from "../../dominio/calendario";
import { esFecha, fechaCorta, haceCuanto, hoy, sumarDias, type Fecha } from "../../dominio/fechas";
import { esIdPersona, otraPersona, type IdPersona } from "../../dominio/pareja";
import {
  CLIMAS,
  COSTES,
  DIFICULTADES,
  DURACIONES,
  filtrar,
  FILTRO_INICIAL,
  ganasDe,
  idGanas,
  MOMENTOS,
  PLAN_VACIO,
  PLAZOS,
  problemaPlan,
  RUTA_GANAS,
  RUTA_PLANES,
  SITIOS,
  sumaGanas,
  textoReserva,
  type FiltroPlanes,
  type Ganas,
  type Lugar,
  type Momento,
  type Plan,
} from "../../dominio/planes";
import { textoMinutos, type Hueco } from "../../dominio/recomendar";
import { RUTA_TAREAS, type Tarea } from "../../dominio/tareas";
import { buscarLugar } from "../../servicios/tiempo";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { campo, conBoton, confirmarPeligro, dialogo, dialogoFormulario, h, tostada } from "../dom";
import { texto, volver } from "./comunes";

let filtro: FiltroPlanes = { ...FILTRO_INICIAL };

export const planes = (app: Merviri) => app.lista<Plan>(RUTA_PLANES);
export const ganasTodas = (app: Merviri) => app.lista<Ganas>(RUTA_GANAS);

const etiqueta = <T extends { id: string; texto: string }>(lista: T[], id: string) => lista.find((x) => x.id === id)?.texto ?? id;

/** Corazones de las dos (♥ llenos según las ganas). */
export function corazones(app: Merviri, plan: string): HTMLElement {
  const g = ganasDe(ganasTodas(app), plan);
  const pareja = app.pareja();
  const de = (p: IdPersona) => {
    const n = g[p];
    return h("span", { class: `ganas t-${pareja.personas[p].color}`, title: `${pareja.personas[p].nombre}: ${n === null ? "sin votar" : `${n} de 3`}` },
      n === null ? "·" : n === 0 ? "✕" : "♥".repeat(n));
  };
  return h("span", { class: "corazones", "aria-label": "Ganas" }, de("p1"), de("p2"));
}

export function fichasPlan(p: Plan): HTMLElement {
  const coste = COSTES.find((c) => c.id === p.coste)!;
  const clima = CLIMAS.find((c) => c.id === p.clima)!;
  return h("span", { class: "meta" },
    h("span", { class: "pastilla pastilla-morado" }, etiqueta(PLAZOS, p.plazo)),
    h("span", {}, etiqueta(DURACIONES, p.duracion)),
    h("span", {}, coste.simbolo),
    p.clima !== "da-igual" ? h("span", { title: clima.texto }, clima.emoji) : null,
    p.dificultad !== "facil" ? h("span", {}, etiqueta(DIFICULTADES, p.dificultad)) : null,
    p.reservaDias ? h("span", {}, `📞 ${textoReserva(p.reservaDias).toLowerCase()}`) : null,
    p.desde ? h("span", {}, `📆 ${fechaCorta(p.desde)}${p.hasta && p.hasta !== p.desde ? `–${fechaCorta(p.hasta)}` : ""}`) : null,
    p.lugar ? h("span", {}, `📍 ${p.lugar.nombre}`) : null,
  );
}

function tarjetaPlan(app: Merviri, p: Registro<Plan>): HTMLElement {
  return h("li", {}, h("a", { class: "tarjeta-enlace plan", href: `#plan/${p.id}` },
    h("span", { class: "crece" },
      h("b", {}, p.titulo),
      fichasPlan(p),
      p.estado === "planificado" && p.fecha ? h("small", { class: "secundario" }, `📅 ${fechaCorta(p.fecha)}`) : null,
      p.estado === "hecho" && p.hechoEn ? h("small", { class: "secundario" }, `✅ ${fechaCorta(p.hechoEn)}${p.valoracion ? ` · ${"⭐".repeat(p.valoracion)}` : ""}`) : null),
    corazones(app, p.id)));
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export function vistaPlanes(app: Merviri): HTMLElement {
  const g = ganasTodas(app);
  const todos = planes(app);
  const vis = filtrar(todos, filtro);
  const orden = (a: Plan, b: Plan) =>
    sumaGanas(ganasDe(g, b.id)) - sumaGanas(ganasDe(g, a.id)) ||
    ["corto", "medio", "largo"].indexOf(a.plazo) - ["corto", "medio", "largo"].indexOf(b.plazo) || a.titulo.localeCompare(b.titulo, "es");
  const ideas = vis.filter((p) => p.estado === "idea").sort(orden);
  const conFecha = vis.filter((p) => p.estado === "planificado").sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  const hechos = vis.filter((p) => p.estado === "hecho").sort((a, b) => (b.hechoEn ?? "").localeCompare(a.hechoEn ?? ""));
  const descartados = vis.filter((p) => p.estado === "descartado");

  const buscar = h("input", {
    type: "search", name: "buscar-planes", placeholder: "Buscar…", value: filtro.texto, "aria-label": "Buscar en los planes",
    "data-refrescable": true, autocomplete: "off",
  });
  buscar.addEventListener("input", () => { filtro = { ...filtro, texto: buscar.value }; app.refrescar(); });
  const chip = (activo: boolean, t: string, cambiar: () => void) =>
    h("button", { type: "button", class: "ficha", "aria-pressed": String(activo), onclick: () => { cambiar(); app.refrescar(); } }, t);

  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Planes"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarPlan(app, null) }, "+ Idea")),
    h("div", { class: "botones-columna" },
      h("a", { class: "boton boton-primario boton-grande", href: "#que-hacemos" }, "✨ ¿Qué hacemos?"),
      h("a", { class: "boton", href: "#descubrir" }, "🔎 Descubrir ideas, conciertos y sitios")),
    h("div", { class: "anadir arriba" }, buscar),
    h("div", { class: "fichas" },
      PLAZOS.map((pl) => chip(filtro.plazo === pl.id, pl.texto, () => { filtro = { ...filtro, plazo: filtro.plazo === pl.id ? null : pl.id }; })),
      chip(filtro.facil, "Fácil", () => { filtro = { ...filtro, facil: !filtro.facil }; }),
      chip(filtro.gratis, "Gratis", () => { filtro = { ...filtro, gratis: !filtro.gratis }; }),
      chip(filtro.corto, "Poco tiempo", () => { filtro = { ...filtro, corto: !filtro.corto }; }),
      chip(filtro.cubierto, "A cubierto", () => { filtro = { ...filtro, cubierto: !filtro.cubierto }; })),
    conFecha.length ? [h("h2", { class: "titulo-seccion" }, "Con fecha"), h("ul", { class: "tarjetas-lista" }, conFecha.map((p) => tarjetaPlan(app, p)))] : null,
    h("h2", { class: "titulo-seccion" }, `Ideas (${ideas.length})`),
    ideas.length
      ? h("ul", { class: "tarjetas-lista" }, ideas.map((p) => tarjetaPlan(app, p)))
      : h("p", { class: "secundario" }, todos.length ? "Ninguna idea con estos filtros." : "Apuntad aquí todo lo que os apetece hacer, aunque sea para algún día. O mirad Descubrir para coger ideas."),
    hechos.length ? h("details", { class: "hechos" }, h("summary", {}, `Hechos (${hechos.length})`), h("ul", { class: "tarjetas-lista" }, hechos.map((p) => tarjetaPlan(app, p)))) : null,
    descartados.length ? h("details", { class: "hechos" }, h("summary", {}, `Descartados (${descartados.length})`), h("ul", { class: "tarjetas-lista" }, descartados.map((p) => tarjetaPlan(app, p)))) : null,
  );
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

async function ponerGanas(app: Merviri, plan: string, n: number) {
  await app.guardar<Ganas>(RUTA_GANAS, { id: idGanas(plan, app.persona), plan, persona: app.persona, ganas: n });
}

export function vistaPlan(app: Merviri, id: string): HTMLElement {
  const p = app.uno<Plan>(RUTA_PLANES, id);
  if (!p) return h("section", {}, volver("#planes", "Planes"), h("p", {}, "Este plan ya no existe."));
  const pareja = app.pareja();
  const yo = app.persona;
  const otra = otraPersona(yo);
  const g = ganasDe(ganasTodas(app), id);
  const mias = h("div", { class: "selector-ganas", role: "radiogroup", "aria-label": "Mis ganas" },
    [0, 1, 2, 3].map((n) => h("button", {
      type: "button", role: "radio", "aria-checked": String(g[yo] === n),
      onclick: () => void ponerGanas(app, id, n),
    }, ["😐 Nada", "♥ Algo", "♥♥ Bastante", "♥♥♥ ¡Muchas!"][n]!)));
  const autor = esIdPersona(p.por) ? pareja.personas[p.por].nombre : "";

  return h("section", {},
    volver("#planes", "Planes"),
    h("h1", {}, p.titulo),
    fichasPlan(p),
    h("div", { class: "tarjeta arriba" },
      h("h2", {}, "¿Cuántas ganas tienes?"),
      mias,
      h("p", { class: "secundario arriba" }, `${pareja.personas[otra].nombre}: `,
        g[otra] === null ? "todavía no ha dicho nada" : ["nada", "algo", "bastantes", "¡muchas!"][g[otra]!]!)),
    p.notas ? h("p", { class: "notas-evento" }, p.notas) : null,
    p.enlace ? h("p", {}, h("a", { href: p.enlace, target: "_blank", rel: "noopener noreferrer" }, "🔗 Abrir el enlace")) : null,
    p.meses.length ? h("p", { class: "secundario" }, `Temporada: ${p.meses.map((m) => MESES[m - 1]).join(", ")}`) : null,
    p.momentos.length ? h("p", { class: "secundario" }, `Mejor por la ${p.momentos.map((m) => etiqueta(MOMENTOS, m).toLowerCase()).join(", ")}`) : null,
    p.importe !== null ? h("p", { class: "secundario" }, `Unos ${p.importe} € para las dos`) : null,
    p.estado === "planificado" && p.fecha ? h("p", {}, h("a", { href: `#calendario/${p.fecha}` }, `📅 En el calendario el ${fechaCorta(p.fecha)}`)) : null,
    p.estado === "hecho" ? h("p", {}, `✅ Hecho el ${fechaCorta(p.hechoEn!)} ${p.valoracion ? "⭐".repeat(p.valoracion) : ""}`, p.comentario ? h("span", { class: "notas-evento" }, p.comentario) : null) : null,
    h("div", { class: "botones arriba" },
      p.estado !== "hecho" ? h("button", { type: "button", class: "boton boton-primario", onclick: () => void ponerFecha(app, p) }, p.estado === "planificado" ? "📅 Cambiar fecha" : "📅 Ponerle fecha") : null,
      h("button", { type: "button", class: "boton", onclick: () => void marcarHecho(app, p) }, "✅ ¡Hecho!"),
      h("a", { class: "boton", href: `#album/plan-${p.id}` }, "📷 Fotos"),
      h("button", { type: "button", class: "boton", onclick: () => void editarPlan(app, p) }, "Editar"),
      p.estado === "descartado"
        ? h("button", { type: "button", class: "boton", onclick: () => void app.guardar<Plan>(RUTA_PLANES, { ...p, estado: "idea" }) }, "Recuperar")
        : h("button", { type: "button", class: "boton", onclick: () => void app.guardar<Plan>(RUTA_PLANES, { ...p, estado: "descartado" }) }, "Descartar"),
      h("button", {
        type: "button", class: "boton boton-peligro",
        onclick: async () => {
          if (!(await confirmarPeligro("Borrar el plan", `Se borra «${p.titulo}» para las dos.`, "Borrar"))) return;
          await app.borrar(RUTA_PLANES, p.id);
          location.hash = "#planes";
        },
      }, "Borrar")),
    autor ? h("p", { class: "secundario pequeno arriba" }, `Última edición: ${autor}, ${haceCuanto(p.actualizado)}.`) : null,
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// ---------------------------------------------------------------------------
// Ponerle fecha (crea el evento en el calendario y, si hace falta, la tarea de reservar)
// ---------------------------------------------------------------------------

const HORAS_MOMENTO: Record<Momento, number> = { manana: 10 * 60, tarde: 17 * 60, noche: 21 * 60 };

/** Crea el evento del plan (y la tarea de reservar) para un hueco o una fecha y hora dadas. */
export async function programarPlan(app: Merviri, p: Plan, dia: Fecha, opciones: { hueco?: Hueco; hora?: string | null; hastaDia?: Fecha } = {}) {
  const dur = DURACIONES.find((d) => d.id === p.duracion)!;
  const todoElDia = p.duracion === "dia" || p.duracion === "finde" || p.duracion === "viaje";
  let hora: string | null = opciones.hora ?? null;
  if (!todoElDia && !hora) {
    const h = opciones.hueco;
    let ini = h ? h.desde : 10 * 60;
    if (h && p.momentos.length) {
      const m = p.momentos.map((x) => HORAS_MOMENTO[x]).find((t) => t >= h.desde && t + 60 <= h.hasta);
      if (m !== undefined) ini = m;
    }
    ini = Math.ceil(ini / 30) * 30;
    hora = textoMinutos(ini);
  }
  const fin = !todoElDia && hora ? textoMinutos(Math.min(23 * 60 + 59, +hora.slice(0, 2) * 60 + +hora.slice(3) + dur.horas * 60)) : null;
  const previo = p.eventoId ? app.eventos().find((e) => e.id === p.eventoId) ?? null : null;
  const evento: Evento = {
    id: p.eventoId ?? nuevoId(), titulo: p.titulo, quien: "ambas", categoria: "plan",
    inicio: dia, fin: opciones.hastaDia ?? opciones.hueco?.hastaDia ?? (p.duracion === "finde" ? sumarDias(dia, 1) : dia),
    todoElDia, horaInicio: todoElDia ? null : hora, horaFin: todoElDia ? null : fin,
    lugar: p.lugar?.nombre ?? null, notas: p.notas, repeticion: null, hasta: null, excepciones: [], privado: false,
    aviso: p.duracion === "rato" || p.duracion === "media" ? "antes" : "vispera",
  };
  await app.guardarEvento(evento, previo);
  await app.guardar<Plan>(RUTA_PLANES, { ...p, estado: "planificado", eventoId: evento.id, fecha: dia });
  avisarEvento(app, evento, previo);
  if (p.reservaDias > 0) {
    const limite = sumarDias(dia, -p.reservaDias);
    const tarea: Tarea = {
      id: nuevoId(), titulo: `Reservar: ${p.titulo}`, notas: p.enlace, responsable: app.persona, turno: null,
      fecha: limite < hoy() ? hoy() : limite, repeticion: null, hecha: false, hechaPor: null, hechaEn: null, recordatorio: null,
    };
    await app.guardar<Tarea>(RUTA_TAREAS, tarea);
  }
  return evento;
}

async function ponerFecha(app: Merviri, p: Registro<Plan>) {
  const todoElDia = p.duracion === "dia" || p.duracion === "finde" || p.duracion === "viaje";
  await dialogoFormulario(`Ponerle fecha a «${p.titulo}»`, [
    campo("Día", h("input", { type: "date", name: "dia", value: p.fecha ?? p.desde ?? hoy(), required: true })),
    todoElDia ? campo("Hasta", h("input", { type: "date", name: "hasta", value: p.duracion === "finde" ? sumarDias(p.fecha ?? hoy(), 1) : (p.fecha ?? hoy()) }))
      : campo("Hora", h("input", { type: "time", name: "hora", value: "18:00" })),
    p.reservaDias ? h("p", { class: "ayuda" }, `📞 Hay que reservar ${p.reservaDias} días antes: se creará la tarea «Reservar».`) : null,
  ], "Al calendario", async (d) => {
    const dia = texto(d, "dia");
    if (!esFecha(dia)) throw new Error("Elige un día.");
    const hasta = texto(d, "hasta");
    await programarPlan(app, p, dia, { hora: todoElDia ? null : texto(d, "hora") || "18:00", hastaDia: esFecha(hasta) && hasta >= dia ? hasta : undefined });
    tostada(`¡Apuntado el ${fechaCorta(dia)}! ✨`);
  });
}

async function marcarHecho(app: Merviri, p: Registro<Plan>) {
  await dialogoFormulario(`¿Qué tal «${p.titulo}»?`, [
    campo("Valoración", h("select", { name: "valoracion" },
      [5, 4, 3, 2, 1].map((n) => h("option", { value: n }, "⭐".repeat(n))))),
    campo("Un comentario (opcional)", h("textarea", { name: "comentario", rows: 2, maxlength: 500 })),
    p.repetible ? h("p", { class: "ayuda" }, "Es repetible: volverá a la lista de ideas.") : null,
  ], "Guardar", async (d) => {
    const v = Number(texto(d, "valoracion"));
    await app.guardar<Plan>(RUTA_PLANES, {
      ...p, estado: p.repetible ? "idea" : "hecho", hechoEn: hoy(), valoracion: v >= 1 && v <= 5 ? v : null,
      comentario: texto(d, "comentario").trim() || null, eventoId: p.repetible ? null : p.eventoId, fecha: p.repetible ? null : p.fecha,
    });
    tostada("¡Qué bien! ✨ ¿Subís las fotos?", "info", { texto: "📷 Fotos", hacer: () => { location.hash = `#album/plan-${p.id}`; } });
  });
}

// ---------------------------------------------------------------------------
// Crear / editar
// ---------------------------------------------------------------------------

const RESERVAS: [number, string][] = [[0, "No hace falta"], [1, "1 día antes"], [3, "3 días antes"], [7, "1 semana antes"], [14, "2 semanas antes"], [30, "1 mes antes"], [60, "2 meses antes"]];

export async function editarPlan(app: Merviri, p: Registro<Plan> | null, base: Partial<Plan> = {}) {
  const v: Plan = p ?? { id: nuevoId(), titulo: "", ...PLAN_VACIO, ...base };
  const sel = <T extends { id: string; texto: string }>(name: string, lista: T[], actual: string) =>
    h("select", { name }, lista.map((x) => h("option", { value: x.id, selected: actual === x.id }, x.texto)));
  let lugar: Lugar | null = v.lugar;
  const lugarTexto = h("input", { name: "lugar", value: v.lugar?.nombre ?? "", maxlength: 80, autocomplete: "off", placeholder: "Segovia, Peñafiel…" });
  const resultados = h("div", { class: "fichas" });
  const estadoLugar = h("p", { class: "ayuda" }, v.lugar?.lat ? "Con previsión del tiempo de ese sitio ✓" : "Si lo buscas, Merviri mirará el tiempo allí.");
  lugarTexto.addEventListener("input", () => { lugar = lugarTexto.value.trim() ? { nombre: lugarTexto.value.trim(), lat: null, lon: null } : null; estadoLugar.textContent = "Si lo buscas, Merviri mirará el tiempo allí."; });
  const botonBuscar = h("button", { type: "button", class: "boton boton-pequeno" }, "Buscar sitio");
  botonBuscar.addEventListener("click", () => void conBoton(botonBuscar, async () => {
    const r = await buscarLugar(lugarTexto.value);
    resultados.replaceChildren(...(r.length ? r.map((x) => h("button", {
      type: "button", class: "ficha",
      onclick: () => {
        lugar = { nombre: x.nombre, lat: x.lat, lon: x.lon };
        lugarTexto.value = x.nombre;
        resultados.replaceChildren();
        estadoLugar.textContent = `📍 ${x.nombre} (${x.detalle}) ✓`;
      },
    }, `${x.nombre} · ${x.detalle}`)) : [h("span", { class: "secundario" }, "No se ha encontrado.")]));
  }));

  const meses = h("div", { class: "selector-dias meses" }, MESES.map((m, i) => h("label", {},
    h("input", { type: "checkbox", name: "mes", value: i + 1, checked: v.meses.includes(i + 1) }), h("span", {}, m))));
  const momentos = h("div", { class: "fichas" }, MOMENTOS.map((m) => h("label", { class: "casilla" },
    h("input", { type: "checkbox", name: "momento", value: m.id, checked: v.momentos.includes(m.id) }), h("span", {}, m.texto))));

  let creado = false;
  await dialogoFormulario(p ? "Editar plan" : "Nueva idea", [
    campo("Qué", h("input", { name: "titulo", value: v.titulo, required: true, maxlength: 120, autocomplete: "off" })),
    h("div", { class: "fila" }, campo("Plazo", sel("plazo", PLAZOS, v.plazo)), campo("Dificultad", sel("dificultad", DIFICULTADES, v.dificultad))),
    h("div", { class: "fila" }, campo("Duración", sel("duracion", DURACIONES, v.duracion)), campo("Coste", sel("coste", COSTES, v.coste))),
    h("div", { class: "fila" },
      campo("¿Hay que reservar?", h("select", { name: "reserva" }, RESERVAS.map(([n, t]) => h("option", { value: n, selected: v.reservaDias === n }, t)))),
      campo("Tiempo que necesita", sel("clima", CLIMAS, v.clima))),
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Mejor momento del día (opcional)"), momentos),
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Temporada (vacío = cualquier mes)"), meses),
    h("div", { class: "fila" },
      campo("Solo desde (opcional)", h("input", { type: "date", name: "desde", value: v.desde ?? "" })),
      campo("hasta", h("input", { type: "date", name: "hasta", value: v.hasta ?? "" }))),
    campo("Dónde", sel("sitio", SITIOS, v.sitio)),
    h("div", { class: "campo" }, h("label", {}, "Sitio concreto (opcional)"), h("div", { class: "fila" }, lugarTexto, botonBuscar), resultados, estadoLugar),
    campo("Precio aproximado para las dos, en € (opcional)", h("input", { type: "number", name: "importe", min: 0, step: 1, value: v.importe ?? "" })),
    campo("Enlace (opcional)", h("input", { type: "url", name: "enlace", value: v.enlace ?? "", placeholder: "https://…" })),
    campo("Etiquetas (separadas por comas)", h("input", { name: "etiquetas", value: v.etiquetas.join(", "), maxlength: 120 })),
    campo("Notas (opcional)", h("textarea", { name: "notas", rows: 2, maxlength: 2000 }, v.notas ?? "")),
    h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "repetible", checked: v.repetible }), h("span", {}, "Se puede repetir (al hacerlo, vuelve a las ideas)")),
  ], p ? "Guardar" : "Añadir", async (d) => {
    const imp = texto(d, "importe");
    const desde = texto(d, "desde");
    const hasta = texto(d, "hasta");
    const nuevo: Plan = {
      ...v,
      titulo: texto(d, "titulo").trim(),
      plazo: texto(d, "plazo") as Plan["plazo"],
      dificultad: texto(d, "dificultad") as Plan["dificultad"],
      duracion: texto(d, "duracion") as Plan["duracion"],
      coste: texto(d, "coste") as Plan["coste"],
      reservaDias: Number(texto(d, "reserva")) || 0,
      clima: texto(d, "clima") as Plan["clima"],
      momentos: d.getAll("momento").map(String) as Momento[],
      meses: d.getAll("mes").map(Number),
      desde: esFecha(desde) ? desde : null,
      hasta: esFecha(hasta) ? hasta : esFecha(desde) ? desde : null,
      sitio: texto(d, "sitio") as Plan["sitio"],
      lugar,
      importe: imp === "" ? null : Number(imp),
      enlace: texto(d, "enlace").trim() || null,
      etiquetas: texto(d, "etiquetas").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10),
      notas: texto(d, "notas").trim() || null,
      repetible: d.get("repetible") === "on",
    };
    const prob = problemaPlan(nuevo);
    if (prob) throw new Error(prob);
    await app.guardar<Plan>(RUTA_PLANES, nuevo);
    if (!p) {
      await ponerGanas(app, nuevo.id, 2);
      avisarPlan(app, nuevo);
      creado = true;
    }
  });
  if (creado) {
    tostada("Idea apuntada ✨");
    location.hash = `#plan/${v.id}`;
  }
}

/** Añadir a planes desde Descubrir (sin formulario). */
export async function anadirPlan(app: Merviri, base: Partial<Plan> & { titulo: string }): Promise<string> {
  const plan: Plan = { ...PLAN_VACIO, ...base, id: nuevoId() };
  await app.guardar<Plan>(RUTA_PLANES, plan);
  await ponerGanas(app, plan.id, 2);
  avisarPlan(app, plan);
  return plan.id;
}

/** Diálogo de confirmación para «Lo hacemos». */
export async function confirmar(texto: string): Promise<boolean> {
  return (await dialogo("¿Lo apuntamos?", h("p", {}, texto), [
    { texto: "Ahora no", valor: "no" }, { texto: "¡Sí!", valor: "si", tipo: "primario" },
  ])) === "si";
}
