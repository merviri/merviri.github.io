import type { Merviri } from "../../app/app";
import {
  horarioDelDia,
  cuadriculaMes,
  delDia,
  emojiCategoria,
  esDe,
  inicioSemana,
  LETRAS_DIA,
  RUTA_HORARIOS,
  sumarMeses,
  textoHora,
  visibleComo,
  type Horario,
  type Ocurrencia,
} from "../../dominio/calendario";
import { esFecha, fechaCorta, hoy, sumarDias, type Fecha } from "../../dominio/fechas";
import { otraPersona, type IdPersona } from "../../dominio/pareja";
import { esMia, RUTA_TAREAS, type Tarea } from "../../dominio/tareas";
import type { Registro } from "../../sync/motor";
import { h } from "../dom";
import { colorDe, diaLargo, editarEvento, editarHorario, textoQuien, verEvento, type EventoVisible } from "./evento";
import { filaTarea } from "./tareas";

type Vista = "mes" | "semana" | "agenda";
type Filtro = "todo" | "mio" | "otra" | "ambas";

const leerVista = (): Vista => {
  try {
    const v = localStorage.getItem("merviri:vista-calendario");
    return v === "semana" || v === "agenda" ? v : "mes";
  } catch {
    return "mes";
  }
};
let vista: Vista = leerVista();
let diaSel: Fecha = hoy();
let filtro: Filtro = "todo";
let verTareas = true;

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const nombreMes = (f: Fecha) => MES.format(new Date(`${f.slice(0, 7)}-15T12:00:00Z`));

/** Eventos visibles para mí (con el aniversario como evento «virtual») y filtrados. */
function eventosVisibles(app: Merviri): EventoVisible[] {
  const yo = app.persona;
  const otra = otraPersona(yo);
  const pareja = app.pareja();
  const lista: EventoVisible[] = app.eventos().map((e) => visibleComo(e, yo));
  if (pareja.juntasDesde) {
    lista.push({
      id: "aniversario", titulo: "Vuestro aniversario 💜", quien: "ambas", categoria: "plan", inicio: pareja.juntasDesde,
      fin: pareja.juntasDesde, todoElDia: true, horaInicio: null, horaFin: null, lugar: null, notas: null,
      repeticion: { cada: 1, unidad: "anio" }, hasta: null, excepciones: [pareja.juntasDesde], privado: false, aviso: "ninguno", virtual: true,
    });
  }
  return lista.filter((e) =>
    filtro === "todo" ? true : filtro === "mio" ? esDe(e, yo) : filtro === "otra" ? esDe(e, otra) : e.quien === "ambas");
}

function tareasVisibles(app: Merviri): Registro<Tarea>[] {
  if (!verTareas) return [];
  const yo = app.persona;
  const otra = otraPersona(yo);
  return app.lista<Tarea>(RUTA_TAREAS).filter((t) => !t.hecha && t.fecha &&
    (filtro === "todo" || (filtro === "mio" && esMia(t, yo)) || (filtro === "otra" && esMia(t, otra)) || (filtro === "ambas" && t.responsable === "ambas")));
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

export function filaEvento(app: Merviri, o: Ocurrencia<EventoVisible>, dia: Fecha): HTMLElement {
  const e = o.evento;
  return h("li", {},
    h("button", { type: "button", class: `evento borde-${colorDe(app, e.quien)}`, onclick: () => void verEvento(app, o) },
      h("span", { class: "hora" }, textoHora(o, dia)),
      h("span", { class: "titulo-evento" }, `${emojiCategoria(e.categoria)} ${e.titulo}`),
      h("span", { class: "meta" },
        h("span", { class: `pastilla pastilla-${colorDe(app, e.quien)}` }, textoQuien(app, e.quien)),
        e.lugar ? h("span", {}, `📍 ${e.lugar}`) : null,
        e.repeticion && !e.virtual ? h("span", {}, "↻") : null)));
}

function listaDelDia(app: Merviri, eventos: EventoVisible[], tareas: Registro<Tarea>[], dia: Fecha): HTMLElement {
  const ocs = delDia(eventos, dia);
  const ts = tareas.filter((t) => t.fecha === dia);
  return h("section", { class: "dia-detalle" },
    h("div", { class: "cabecera-vista" },
      h("h2", {}, diaLargo(dia)),
      h("button", { type: "button", class: "boton", onclick: () => void editarEvento(app, null, dia) }, "+ Añadir")),
    ocs.length ? h("ul", { class: "eventos" }, ocs.map((o) => filaEvento(app, o, dia))) : null,
    ts.length ? h("ul", { class: "elementos arriba" }, ts.map((t) => filaTarea(app, t, hoy()))) : null,
    !ocs.length && !ts.length ? h("p", { class: "secundario" }, "Nada apuntado.") : null,
  );
}

function puntos(app: Merviri, eventos: EventoVisible[], tareas: Tarea[], dia: Fecha): HTMLElement {
  const ocs = delDia(eventos, dia);
  const colores = ocs.slice(0, 4).map((o) => colorDe(app, o.evento.quien));
  const hayTareas = tareas.some((t) => t.fecha === dia);
  return h("span", { class: "puntos", "aria-hidden": "true" },
    colores.map((c) => h("i", { class: `c-${c}` })),
    ocs.length > 4 ? h("b", {}, "+") : null,
    hayTareas ? h("i", { class: "tarea" }) : null);
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

function vistaMes(app: Merviri, eventos: EventoVisible[], tareas: Tarea[]): HTMLElement {
  const dias = cuadriculaMes(diaSel);
  const mes = diaSel.slice(0, 7);
  const hoyF = hoy();
  return h("div", { class: "mes", role: "grid", "aria-label": nombreMes(diaSel) },
    h("div", { class: "fila-semana cabecera-semana", role: "row" }, LETRAS_DIA.map((l) => h("span", { role: "columnheader" }, l))),
    Array.from({ length: 6 }, (_, s) => h("div", { class: "fila-semana", role: "row" },
      dias.slice(s * 7, s * 7 + 7).map((d) => {
        const n = delDia(eventos, d).length + tareas.filter((t) => t.fecha === d).length;
        return h("button", {
          type: "button", role: "gridcell",
          class: ["dia", d.slice(0, 7) !== mes ? "fuera" : "", d === hoyF ? "hoy" : "", d === diaSel ? "sel" : ""].filter(Boolean).join(" "),
          "aria-label": `${diaLargo(d)}${n ? `, ${n} cosa${n === 1 ? "" : "s"}` : ""}`,
          "aria-pressed": String(d === diaSel),
          onclick: () => { diaSel = d; app.refrescar(); },
        }, h("span", { class: "num" }, String(+d.slice(8, 10))), puntos(app, eventos, tareas, d));
      }))),
  );
}

const ALTO_HORA = 44;

function vistaSemana(app: Merviri, eventos: EventoVisible[], tareas: Tarea[]): HTMLElement {
  const lunes = inicioSemana(diaSel);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const hoyF = hoy();
  const yo = app.persona;
  const otra = otraPersona(yo);
  const horarios = (filtro === "otra" ? [otra] : filtro === "mio" ? [yo] : [yo, otra]) as IdPersona[];

  const cabecera = h("div", { class: "semana-cabecera" }, h("span", {}),
    dias.map((d, i) => h("button", {
      type: "button", class: ["dia-semana", d === hoyF ? "hoy" : "", d === diaSel ? "sel" : ""].filter(Boolean).join(" "),
      onclick: () => { diaSel = d; app.refrescar(); },
    }, h("small", {}, LETRAS_DIA[i]!), h("b", {}, String(+d.slice(8, 10))))));

  // Todo el día y varios días, arriba.
  const todoDia = h("div", { class: "semana-todo-dia" }, h("span", { class: "secundario" }, "todo"),
    dias.map((d) => h("div", {},
      delDia(eventos, d).filter((o) => o.evento.todoElDia || o.dia !== o.hastaDia).map((o) =>
        h("button", { type: "button", class: `chip-evento c-${colorDe(app, o.evento.quien)}`, onclick: () => void verEvento(app, o) }, o.evento.titulo)),
      tareas.filter((t) => t.fecha === d).length ? h("span", { class: "chip-tarea" }, `✅ ${tareas.filter((t) => t.fecha === d).length}`) : null)));

  const columnas = dias.map((d) => {
    const col = h("div", { class: "columna-dia" });
    // Horario habitual: franjas suaves (izquierda la persona turquesa, derecha la rosa).
    for (const p of horarios) {
      const hor = app.uno<Horario>(RUTA_HORARIOS, p);
      // Sin los días u horas de vacaciones / libres.
      for (const b of horarioDelDia(hor, d, p, app.eventos())) {
        const franja = h("div", { class: `franja c-${app.pareja().personas[p].color} ${p === "p1" ? "izq" : "der"}`, title: `${app.pareja().personas[p].nombre}: ${b.etiqueta}` });
        franja.style.top = `${(b.desde / 60) * ALTO_HORA}px`;
        franja.style.height = `${((b.hasta - b.desde) / 60) * ALTO_HORA}px`;
        col.append(franja);
      }
    }
    // Eventos con hora: en carriles si se solapan.
    const conHora = delDia(eventos, d).filter((o) => !o.evento.todoElDia && o.dia === o.hastaDia && o.evento.horaInicio);
    const fins: number[] = [];
    const colocados = conHora.map((o) => {
      const ini = +o.evento.horaInicio!.slice(0, 2) * 60 + +o.evento.horaInicio!.slice(3);
      const fin = o.evento.horaFin ? +o.evento.horaFin.slice(0, 2) * 60 + +o.evento.horaFin.slice(3) : ini + 60;
      let carril = fins.findIndex((f) => f <= ini);
      if (carril === -1) { carril = fins.length; fins.push(fin); } else fins[carril] = fin;
      return { o, ini, fin: Math.max(fin, ini + 30), carril };
    });
    const carriles = Math.max(1, fins.length);
    for (const c of colocados) {
      const b = h("button", { type: "button", class: `bloque-evento c-${colorDe(app, c.o.evento.quien)}`, onclick: () => void verEvento(app, c.o) },
        h("b", {}, c.o.evento.horaInicio!), " ", c.o.evento.titulo);
      b.style.top = `${(c.ini / 60) * ALTO_HORA}px`;
      b.style.height = `${((c.fin - c.ini) / 60) * ALTO_HORA - 2}px`;
      b.style.left = `${(c.carril / carriles) * 100}%`;
      b.style.width = `${100 / carriles}%`;
      col.append(b);
    }
    if (d === hoyF) {
      const ahora = new Date();
      const min = +new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hourCycle: "h23" }).format(ahora) * 60 +
        +new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", minute: "2-digit" }).format(ahora);
      const linea = h("div", { class: "ahora" });
      linea.style.top = `${(min / 60) * ALTO_HORA}px`;
      col.append(linea);
    }
    return col;
  });

  const horas = h("div", { class: "columna-horas" }, Array.from({ length: 24 }, (_, i) => h("span", {}, `${i}:00`)));
  const rejilla = h("div", { class: "semana-rejilla" }, horas, columnas);
  rejilla.style.height = `${24 * ALTO_HORA}px`;
  const scroll = h("div", { class: "semana-scroll" }, rejilla);
  requestAnimationFrame(() => { scroll.scrollTop = 7.5 * ALTO_HORA; });
  return h("div", { class: "semana" }, cabecera, todoDia, scroll);
}

function vistaAgenda(app: Merviri, eventos: EventoVisible[], tareas: Registro<Tarea>[]): HTMLElement {
  const desde = hoy();
  const dias = Array.from({ length: 60 }, (_, i) => sumarDias(desde, i));
  const bloques = dias.map((d) => {
    const ocs = delDia(eventos, d);
    const ts = tareas.filter((t) => t.fecha === d || (d === desde && t.fecha! < desde));
    if (!ocs.length && !ts.length) return null;
    return h("section", { class: "dia-agenda" },
      h("h3", {}, d === desde ? `Hoy · ${diaLargo(d)}` : diaLargo(d)),
      ocs.length ? h("ul", { class: "eventos" }, ocs.map((o) => filaEvento(app, o, d))) : null,
      ts.length ? h("ul", { class: "elementos" }, ts.map((t) => filaTarea(app, t, desde))) : null);
  }).filter((x): x is HTMLElement => x !== null);
  return bloques.length
    ? h("div", { class: "agenda" }, bloques)
    : h("p", { class: "secundario centro arriba-mas" }, "Nada en los próximos dos meses. ¡Hora de planear algo! ✨");
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export function vistaCalendario(app: Merviri, param = ""): HTMLElement {
  if (esFecha(param) && param !== diaSel) diaSel = param;
  const pareja = app.pareja();
  const otra = otraPersona(app.persona);
  const eventos = eventosVisibles(app);
  const tareas = tareasVisibles(app);

  const cambiarVista = (v: Vista) => {
    vista = v;
    try { localStorage.setItem("merviri:vista-calendario", v); } catch { /* sin almacenamiento */ }
    app.refrescar();
  };
  const mover = (n: number) => {
    diaSel = vista === "mes" ? (() => {
      const m = sumarMeses(diaSel, n);
      return m.slice(0, 7) === hoy().slice(0, 7) ? hoy() : m;
    })() : sumarDias(diaSel, 7 * n);
    app.refrescar();
  };
  const titulo = vista === "mes"
    ? nombreMes(diaSel)
    : vista === "semana"
      ? (() => { const l = inicioSemana(diaSel); return `Semana del ${fechaCorta(l)} al ${fechaCorta(sumarDias(l, 6))}`; })()
      : "Próximos dos meses";
  const chip = (f: Filtro, t: string) => h("button", {
    type: "button", class: "ficha", "aria-pressed": String(filtro === f), onclick: () => { filtro = f; app.refrescar(); },
  }, t);

  return h("section", { class: "calendario" },
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Calendario"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarEvento(app, null, diaSel) }, "+ Nuevo")),
    h("div", { class: "segmentado", role: "tablist", "aria-label": "Vista" },
      (["mes", "semana", "agenda"] as const).map((v) => h("button", {
        type: "button", role: "tab", "aria-selected": String(vista === v), onclick: () => cambiarVista(v),
      }, { mes: "Mes", semana: "Semana", agenda: "Agenda" }[v]))),
    h("div", { class: "fichas" },
      chip("todo", "Todo"), chip("mio", "Lo mío"), chip("otra", `De ${pareja.personas[otra].nombre}`), chip("ambas", "Las dos"),
      h("button", { type: "button", class: "ficha", "aria-pressed": String(verTareas), onclick: () => { verTareas = !verTareas; app.refrescar(); } }, "✅ Tareas")),
    vista !== "agenda"
      ? h("div", { class: "navegar-fecha" },
        h("button", { type: "button", class: "boton-icono", "aria-label": "Anterior", onclick: () => mover(-1) }, "‹"),
        h("h2", {}, titulo),
        h("button", { type: "button", class: "boton-icono", "aria-label": "Siguiente", onclick: () => mover(1) }, "›"),
        h("button", { type: "button", class: "boton boton-pequeno", onclick: () => { diaSel = hoy(); app.refrescar(); } }, "Hoy"))
      : null,
    vista === "mes" ? vistaMes(app, eventos, tareas) : vista === "semana" ? vistaSemana(app, eventos, tareas) : vistaAgenda(app, eventos, tareas),
    vista !== "agenda" ? listaDelDia(app, eventos, tareas, diaSel) : null,
    h("div", { class: "botones arriba-mas" },
      h("button", { type: "button", class: "boton", onclick: () => editarHorario(app) }, "🕘 Mi horario habitual"),
      h("button", {
        type: "button", class: "boton",
        onclick: () => void editarEvento(app, null, diaSel, { categoria: "vacaciones", titulo: "Vacaciones", todoElDia: true, quien: app.persona }),
      }, "🌴 Vacaciones o día libre"),
      h("button", {
        type: "button", class: "boton",
        onclick: () => void editarEvento(app, null, diaSel, { categoria: "cumple", titulo: "Cumpleaños de ", todoElDia: true, repeticion: { cada: 1, unidad: "anio" }, quien: "ambas" }),
      }, "🎂 Añadir un cumpleaños")),
  );
}

/** Para la portada: lo de hoy y lo de los próximos días (para las dos, visto por mí). */
export function eventosDeHoyYProximos(app: Merviri, dias = 3) {
  const yo = app.persona;
  const visibles = app.eventos().map((e) => visibleComo(e, yo)) as EventoVisible[];
  const hoyF = hoy();
  const proximos: { dia: Fecha; ocs: Ocurrencia<EventoVisible>[] }[] = [];
  for (let i = 1; i <= dias; i++) {
    const d = sumarDias(hoyF, i);
    const ocs = delDia(visibles, d).filter((o) => o.dia === d);
    if (ocs.length) proximos.push({ dia: d, ocs });
  }
  return { hoy: delDia(visibles, hoyF), proximos };
}
