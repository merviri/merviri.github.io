import type { Merviri } from "../../app/app";
import { diasEntre, esFecha, fechaCorta, haceCuanto, hoy, sumarDias, type Fecha } from "../../dominio/fechas";
import { otraPersona, type IdPersona, type Pareja } from "../../dominio/pareja";
import {
  agrupar,
  aQuien,
  completar,
  esMia,
  hechasRecientes,
  problemaTarea,
  reabrir,
  RUTA_TAREAS,
  SECCIONES,
  textoRepeticion,
  type Repeticion,
  type Responsable,
  type Tarea,
} from "../../dominio/tareas";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { avisarRecordatorio, avisarTarea } from "../../app/eventos";
import { campo, dialogoFormulario, h, tostada } from "../dom";
import { texto } from "./comunes";

type Filtro = "todas" | "mias" | "otra" | "ambas";
let filtro: Filtro = "todas";

const DIA_CORTO = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", timeZone: "UTC" });

/** «hoy», «mañana», «ayer», «vie 14», «3 dic». */
export function fechaRelativa(f: Fecha, hoyF: Fecha): string {
  const d = diasEntre(hoyF, f);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d > 1 && d <= 7) return DIA_CORTO.format(new Date(`${f}T12:00:00Z`)).replace(".", "");
  return fechaCorta(f) + (f.slice(0, 4) !== hoyF.slice(0, 4) ? ` ${f.slice(0, 4)}` : "");
}

function pastillaResponsable(t: Tarea, pareja: Pareja) {
  const q = aQuien(t);
  if (q === "ambas") return h("span", { class: "pastilla pastilla-morado" }, "Las dos");
  const p = pareja.personas[q];
  return h("span", { class: `pastilla pastilla-${p.color}` }, t.responsable === "turnos" ? `Le toca a ${p.nombre}` : p.nombre);
}

/** Completa una tarea con la opción de deshacer. */
export async function marcarHecha(app: Merviri, t: Registro<Tarea>) {
  const nueva = completar(t, app.persona, hoy(), new Date().toISOString());
  await app.guardar<Tarea>(RUTA_TAREAS, nueva);
  const pareja = app.pareja();
  let msg = "¡Hecho! ✨";
  if (t.repeticion && nueva.fecha) {
    const q = aQuien(nueva);
    msg = `¡Hecho! Próxima vez: ${fechaRelativa(nueva.fecha, hoy())}` +
      (t.responsable === "turnos" && q !== "ambas" ? ` (le toca a ${pareja.personas[q].nombre})` : "");
  }
  tostada(msg, "info", { texto: "Deshacer", hacer: () => void app.guardar<Tarea>(RUTA_TAREAS, { ...t }) });
}

export function filaTarea(app: Merviri, t: Registro<Tarea>, hoyF: Fecha): HTMLElement {
  const pareja = app.pareja();
  const casilla = h("input", { type: "checkbox", checked: t.hecha, "aria-label": `Hecha: ${t.titulo}` });
  casilla.addEventListener("change", () => {
    if (casilla.checked) void marcarHecha(app, t);
    else void app.guardar<Tarea>(RUTA_TAREAS, reabrir(t));
  });
  const otra = otraPersona(app.persona);
  const q = aQuien(t);
  const puedeRecordar = !t.hecha && q === otra;
  const atrasada = t.fecha && !t.hecha && t.fecha < hoyF;
  return h("li", { class: t.hecha ? "hecho" : "" },
    h("label", { class: "casilla-grande redonda" }, casilla, h("span", { class: "marca", "aria-hidden": "true" })),
    h("button", { type: "button", class: "elemento", onclick: () => void editarTarea(app, t) },
      h("span", {}, t.titulo),
      h("span", { class: "meta" },
        pastillaResponsable(t, pareja),
        t.fecha && !t.hecha ? h("span", { class: atrasada ? "fecha atrasada" : "fecha" }, fechaRelativa(t.fecha, hoyF)) : null,
        t.repeticion ? h("span", { class: "fecha" }, `↻ ${textoRepeticion(t.repeticion).toLowerCase()}`) : null,
        t.hecha && t.hechaPor ? h("span", { class: "fecha" }, `${pareja.personas[t.hechaPor].nombre} · ${haceCuanto(t.hechaEn!)}`) : null,
        t.recordatorio && !t.recordatorio.visto ? h("span", { class: "fecha" }, "🔔 recordado") : null,
      ),
    ),
    puedeRecordar
      ? h("button", {
        type: "button", class: "boton-icono", title: `Recordárselo a ${pareja.personas[otra].nombre}`,
        "aria-label": `Recordárselo a ${pareja.personas[otra].nombre}`,
        onclick: async () => {
          await app.guardar<Tarea>(RUTA_TAREAS, {
            ...t, recordatorio: { por: app.persona, para: otra, en: new Date().toISOString(), visto: null },
          });
          avisarRecordatorio(app, t, otra);
          tostada(`${pareja.personas[otra].nombre} lo verá al abrir Merviri 🔔`);
        },
      }, "🔔")
      : null,
  );
}

export function vistaTareas(app: Merviri): HTMLElement {
  const pareja = app.pareja();
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  const todas = app.lista<Tarea>(RUTA_TAREAS);
  const filtrar = (t: Tarea) =>
    filtro === "todas" ? true
    : filtro === "mias" ? esMia(t, yo)
    : filtro === "otra" ? esMia(t, otra)
    : aQuien(t) === "ambas";
  const visibles = todas.filter(filtrar);
  const grupos = agrupar(visibles, hoyF);
  const hechas = hechasRecientes(visibles, new Date());
  const hayAlgo = SECCIONES.some((s) => grupos[s.id].length);

  const chip = (f: Filtro, etiqueta: string) =>
    h("button", {
      type: "button", class: "ficha", "aria-pressed": String(filtro === f),
      onclick: () => { filtro = f; app.refrescar(); },
    }, etiqueta);

  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Tareas"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarTarea(app, null) }, "+ Nueva"),
    ),
    h("div", { class: "fichas" },
      chip("todas", "Todas"), chip("mias", "Mías"), chip("otra", `De ${pareja.personas[otra].nombre}`), chip("ambas", "Las dos")),
    hayAlgo
      ? SECCIONES.filter((s) => grupos[s.id].length).map((s) => h("div", {},
        h("h2", { class: `titulo-seccion ${s.id === "atrasadas" ? "atrasada" : ""}` }, s.titulo),
        h("ul", { class: "elementos" }, grupos[s.id].map((t) => filaTarea(app, t, hoyF)))))
      : h("p", { class: "secundario centro arriba-mas" }, todas.length ? "Nada pendiente por aquí ✨" : "Todavía no hay tareas. Crea la primera con «+ Nueva»."),
    hechas.length
      ? h("details", { class: "hechos" },
        h("summary", {}, `Hechas estos días (${hechas.length})`),
        h("ul", { class: "elementos" }, hechas.map((t) => filaTarea(app, t, hoyF))))
      : null,
  );
}

const REPETICIONES: { valor: string; texto: string; r: Repeticion | null }[] = [
  { valor: "no", texto: "No se repite", r: null },
  { valor: "1-dia", texto: "Cada día", r: { cada: 1, unidad: "dia" } },
  { valor: "1-semana", texto: "Cada semana", r: { cada: 1, unidad: "semana" } },
  { valor: "2-semana", texto: "Cada 2 semanas", r: { cada: 2, unidad: "semana" } },
  { valor: "1-mes", texto: "Cada mes", r: { cada: 1, unidad: "mes" } },
  { valor: "3-mes", texto: "Cada 3 meses", r: { cada: 3, unidad: "mes" } },
  { valor: "otra", texto: "Otra…", r: null },
];

function valorRepeticion(r: Repeticion | null): string {
  if (!r) return "no";
  return REPETICIONES.find((x) => x.r && x.r.cada === r.cada && x.r.unidad === r.unidad)?.valor ?? "otra";
}

export async function editarTarea(app: Merviri, t: Registro<Tarea> | null) {
  const pareja = app.pareja();
  const yo = app.persona;
  const otra = otraPersona(yo);
  const hoyF = hoy();
  let borrar = false;

  const responsable = h("select", { name: "responsable" },
    h("option", { value: yo, selected: (t?.responsable ?? yo) === yo }, `${pareja.personas[yo].nombre} (yo)`),
    h("option", { value: otra, selected: t?.responsable === otra }, pareja.personas[otra].nombre),
    h("option", { value: "ambas", selected: t?.responsable === "ambas" }, "Las dos"),
    h("option", { value: "turnos", selected: t?.responsable === "turnos" }, "Por turnos"),
  );
  const turno = h("select", { name: "turno" },
    (["p1", "p2"] as const).map((p) => h("option", { value: p, selected: (t?.turno ?? yo) === p }, pareja.personas[p].nombre)));
  const filaTurno = campo("Empieza (le toca ahora a)", turno);
  const fecha = h("input", { name: "fecha", type: "date", value: t?.fecha ?? "" });
  const rapidas = h("div", { class: "fichas" },
    [["Hoy", 0], ["Mañana", 1], ["En una semana", 7]].map(([etq, n]) =>
      h("button", { type: "button", class: "ficha", onclick: () => { fecha.value = sumarDias(hoyF, n as number); } }, etq as string)),
    h("button", { type: "button", class: "ficha", onclick: () => { fecha.value = ""; } }, "Sin fecha"));
  const repeticion = h("select", { name: "repeticion" },
    REPETICIONES.map((r) => h("option", { value: r.valor, selected: valorRepeticion(t?.repeticion ?? null) === r.valor }, r.texto)));
  const cada = h("input", { name: "cada", type: "number", min: 1, max: 365, value: t?.repeticion?.cada ?? 1, class: "corto" });
  const unidad = h("select", { name: "unidad" },
    ([["dia", "días"], ["semana", "semanas"], ["mes", "meses"]] as const).map(([v, txt]) =>
      h("option", { value: v, selected: (t?.repeticion?.unidad ?? "semana") === v }, txt)));
  const filaOtra = h("div", { class: "campo" }, h("span", { class: "grupo-titulo" }, "Cada"), h("div", { class: "fila" }, cada, unidad));

  const actualizar = () => {
    filaTurno.hidden = responsable.value !== "turnos";
    filaOtra.hidden = repeticion.value !== "otra";
  };
  responsable.addEventListener("change", actualizar);
  repeticion.addEventListener("change", actualizar);
  actualizar();

  await dialogoFormulario(t ? "Editar tarea" : "Nueva tarea", [
    campo("Qué hay que hacer", h("input", { name: "titulo", value: t?.titulo ?? "", required: true, maxlength: 120, autocomplete: "off" })),
    campo("Quién", responsable),
    filaTurno,
    campo("Cuándo", fecha),
    rapidas,
    campo("¿Se repite?", repeticion),
    filaOtra,
    campo("Notas (opcional)", h("textarea", { name: "notas", rows: 2, maxlength: 1000 }, t?.notas ?? "")),
    t ? h("button", {
      type: "button", class: "enlace-boton peligro",
      onclick: (ev: Event) => { borrar = true; (ev.target as HTMLElement).closest("form")!.requestSubmit(); },
    }, "Borrar la tarea") : null,
  ], t ? "Guardar" : "Crear", async (d) => {
    if (t && borrar) {
      await app.borrar(RUTA_TAREAS, t.id);
      tostada("Tarea borrada", "info", { texto: "Deshacer", hacer: () => void app.guardar<Tarea>(RUTA_TAREAS, { ...t }) });
      return;
    }
    const resp = texto(d, "responsable") as Responsable;
    const f = texto(d, "fecha");
    const rv = texto(d, "repeticion");
    const rep: Repeticion | null = rv === "otra"
      ? { cada: Number(texto(d, "cada")), unidad: texto(d, "unidad") as Repeticion["unidad"] }
      : REPETICIONES.find((x) => x.valor === rv)?.r ?? null;
    const nueva: Tarea = {
      id: t?.id ?? nuevoId(),
      titulo: texto(d, "titulo").trim(),
      notas: texto(d, "notas").trim() || null,
      responsable: resp,
      turno: resp === "turnos" ? (texto(d, "turno") as IdPersona) : null,
      fecha: esFecha(f) ? f : null,
      repeticion: rep,
      hecha: t?.hecha ?? false,
      hechaPor: t?.hechaPor ?? null,
      hechaEn: t?.hechaEn ?? null,
      recordatorio: t?.recordatorio ?? null,
    };
    if (nueva.repeticion && !nueva.fecha) nueva.fecha = hoyF;
    const p = problemaTarea(nueva);
    if (p) throw new Error(p);
    await app.guardar<Tarea>(RUTA_TAREAS, nueva);
    avisarTarea(app, nueva, t);
  });
}
