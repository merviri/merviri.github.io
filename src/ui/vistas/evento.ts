import type { Merviri } from "../../app/app";
import { avisarEvento } from "../../app/eventos";
import {
  AVISOS_EVENTO,
  CATEGORIAS,
  emojiCategoria,
  esHora,
  LETRAS_DIA,
  problemaBloque,
  problemaEvento,
  RUTA_HORARIOS,
  textoRepeticionEvento,
  type BloqueHorario,
  type Categoria,
  type Evento,
  type Horario,
  type Ocurrencia,
  type Quien,
  type RepeticionEvento,
} from "../../dominio/calendario";
import { esFecha, fechaCorta, fechaLarga, type Fecha } from "../../dominio/fechas";
import { esIdPersona, otraPersona, type IdPersona } from "../../dominio/pareja";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { campo, confirmarPeligro, dialogo, dialogoFormulario, h, tostada } from "../dom";
import { texto } from "./comunes";

/** Evento tal como se pinta (puede ser «virtual», como el aniversario). */
export type EventoVisible = Evento & { virtual?: true; por?: string; actualizado?: string };

const DIA_LARGO = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
export const diaLargo = (f: Fecha) => DIA_LARGO.format(new Date(`${f}T12:00:00Z`));

export function colorDe(app: Merviri, q: Quien): string {
  return q === "ambas" ? "morado" : app.pareja().personas[q].color;
}

export function textoQuien(app: Merviri, q: Quien): string {
  return q === "ambas" ? "Las dos" : app.pareja().personas[q].nombre;
}

function textoCuando(o: Ocurrencia<EventoVisible>): string {
  const e = o.evento;
  if (o.dia === o.hastaDia) {
    const horas = e.todoElDia ? "todo el día" : e.horaFin ? `de ${e.horaInicio} a ${e.horaFin}` : `a las ${e.horaInicio}`;
    return `${diaLargo(o.dia)}, ${horas}`;
  }
  const desde = e.todoElDia ? fechaCorta(o.dia) : `${fechaCorta(o.dia)} (${e.horaInicio})`;
  const hasta = e.todoElDia || !e.horaFin ? fechaCorta(o.hastaDia) : `${fechaCorta(o.hastaDia)} (${e.horaFin})`;
  return `Del ${desde} al ${hasta}`;
}

// ---------------------------------------------------------------------------
// Ver un evento
// ---------------------------------------------------------------------------

export async function verEvento(app: Merviri, o: Ocurrencia<EventoVisible>) {
  const e = o.evento;
  const pareja = app.pareja();
  const ajeno = e.privado && e.quien !== app.persona;
  const autor = esIdPersona(e.por) ? pareja.personas[e.por].nombre : null;
  const cuerpo = h("div", { class: "detalle-evento" },
    h("p", {}, h("span", { class: `pastilla pastilla-${colorDe(app, e.quien)}` }, textoQuien(app, e.quien)), " ",
      h("span", { class: "secundario" }, `${emojiCategoria(e.categoria)} ${CATEGORIAS.find((c) => c.id === e.categoria)?.nombre ?? ""}`)),
    h("p", {}, `🕒 ${textoCuando(o)}`),
    e.lugar ? h("p", {}, `📍 ${e.lugar}`) : null,
    e.repeticion ? h("p", {}, `↻ ${textoRepeticionEvento(e.repeticion)}${e.hasta ? ` hasta el ${fechaLarga(e.hasta)}` : ""}`) : null,
    e.aviso && e.aviso !== "ninguno" ? h("p", {}, `🔔 ${AVISOS_EVENTO.find((a) => a.id === e.aviso)?.texto}`) : null,
    e.notas ? h("p", { class: "notas-evento" }, e.notas) : null,
    e.privado && !ajeno ? h("p", { class: "secundario" }, `🔒 ${pareja.personas[otraPersona(app.persona)].nombre} solo ve «Ocupada».`) : null,
    autor && !e.virtual ? h("p", { class: "secundario pequeno" }, `Lo apuntó ${autor}.`) : null,
    e.virtual ? h("p", { class: "secundario pequeno" }, "La fecha se cambia en Ajustes → Vosotras.") : null,
  );
  const acciones: { texto: string; valor: string; tipo?: "primario" | "peligro" | "normal" }[] = [{ texto: "Cerrar", valor: "cerrar" }];
  if (!e.virtual && !ajeno) {
    acciones.unshift({ texto: "Borrar", valor: "borrar", tipo: "peligro" });
    acciones.push({ texto: "Editar", valor: "editar", tipo: "primario" });
  }
  const r = await dialogo(e.titulo, cuerpo, acciones);
  if (r === "editar") await editarEvento(app, e as Registro<Evento>, o.dia);
  if (r === "borrar") await borrarEvento(app, e as Registro<Evento>, o.dia);
}

async function borrarEvento(app: Merviri, e: Registro<Evento>, dia: Fecha) {
  if (e.repeticion) {
    const r = await dialogo("Borrar un evento que se repite", h("p", {}, `«${e.titulo}» se repite. ¿Qué quieres borrar?`), [
      { texto: "Cancelar", valor: "no" },
      { texto: `Solo el ${fechaCorta(dia)}`, valor: "uno" },
      { texto: "Todos", valor: "todos", tipo: "peligro" },
    ]);
    if (r === "uno") {
      await app.guardarEvento({ ...e, excepciones: [...new Set([...(e.excepciones ?? []), dia])].sort() }, e);
      tostada(`Quitado el ${fechaCorta(dia)}`);
    } else if (r === "todos") {
      await app.borrarEvento(e);
      tostada("Borrado", "info", { texto: "Deshacer", hacer: () => void app.guardarEvento({ ...e }, null) });
    }
    return;
  }
  if (!(await confirmarPeligro("Borrar", `Se borra «${e.titulo}» para las dos.`, "Borrar"))) return;
  await app.borrarEvento(e);
  tostada("Borrado", "info", { texto: "Deshacer", hacer: () => void app.guardarEvento({ ...e }, null) });
}

// ---------------------------------------------------------------------------
// Crear o editar
// ---------------------------------------------------------------------------

const REPETICIONES: { valor: string; texto: string; r: RepeticionEvento | null }[] = [
  { valor: "no", texto: "No se repite", r: null },
  { valor: "1-dia", texto: "Cada día", r: { cada: 1, unidad: "dia" } },
  { valor: "1-semana", texto: "Cada semana", r: { cada: 1, unidad: "semana" } },
  { valor: "2-semana", texto: "Cada 2 semanas", r: { cada: 2, unidad: "semana" } },
  { valor: "1-mes", texto: "Cada mes", r: { cada: 1, unidad: "mes" } },
  { valor: "1-anio", texto: "Cada año", r: { cada: 1, unidad: "anio" } },
];
const valorRep = (r: RepeticionEvento | null) =>
  REPETICIONES.find((x) => (x.r === null && r === null) || (x.r && r && x.r.cada === r.cada && x.r.unidad === r.unidad))?.valor ?? "no";

export interface Plantilla {
  categoria?: Categoria;
  titulo?: string;
  todoElDia?: boolean;
  repeticion?: RepeticionEvento | null;
  quien?: Quien;
}

export async function editarEvento(app: Merviri, e: Registro<Evento> | null, dia: Fecha, plantilla: Plantilla = {}) {
  const pareja = app.pareja();
  const yo = app.persona;
  const otra = otraPersona(yo);
  const base: Evento = e ?? {
    id: nuevoId(), titulo: plantilla.titulo ?? "", quien: plantilla.quien ?? "ambas", categoria: plantilla.categoria ?? "plan",
    inicio: dia, fin: dia, todoElDia: plantilla.todoElDia ?? false, horaInicio: plantilla.todoElDia ? null : "10:00", horaFin: null,
    lugar: null, notas: null, repeticion: plantilla.repeticion ?? null, hasta: null, excepciones: [], privado: false,
    aviso: plantilla.categoria === "cumple" ? "vispera" : "ninguno",
  };

  const quien = h("select", { name: "quien" },
    h("option", { value: "ambas", selected: base.quien === "ambas" }, "Las dos"),
    h("option", { value: yo, selected: base.quien === yo }, `${pareja.personas[yo].nombre} (yo)`),
    h("option", { value: otra, selected: base.quien === otra }, pareja.personas[otra].nombre));
  const categorias = h("div", { class: "selector-categoria", role: "radiogroup", "aria-label": "Tipo" },
    CATEGORIAS.map((c) => h("label", {},
      h("input", { type: "radio", name: "categoria", value: c.id, checked: base.categoria === c.id }),
      h("span", {}, `${c.emoji} ${c.nombre}`))));
  const todoDia = h("input", { type: "checkbox", name: "todoElDia", checked: base.todoElDia });
  const inicio = h("input", { type: "date", name: "inicio", value: base.inicio, required: true });
  const fin = h("input", { type: "date", name: "fin", value: base.fin, required: true });
  const hIni = h("input", { type: "time", name: "horaInicio", value: base.horaInicio ?? "10:00" });
  const hFin = h("input", { type: "time", name: "horaFin", value: base.horaFin ?? "" });
  const filaHoras = h("div", { class: "fila" }, campo("Hora", hIni), campo("Hasta las (opcional)", hFin));
  const repeticion = h("select", { name: "repeticion" },
    REPETICIONES.map((r) => h("option", { value: r.valor, selected: valorRep(base.repeticion) === r.valor }, r.texto)));
  const hastaRep = h("input", { type: "date", name: "hasta", value: base.hasta ?? "" });
  const filaHasta = campo("Hasta (opcional)", hastaRep, e?.repeticion ? "Los cambios se aplican a todas las repeticiones." : undefined);
  const privado = h("input", { type: "checkbox", name: "privado", checked: base.privado });
  const filaPrivado = h("label", { class: "casilla" }, privado,
    h("span", {}, `🔒 Ocupada sin detalles: ${pareja.personas[otra].nombre} solo verá «Ocupada» (para sorpresas)`));

  const actualizar = () => {
    filaHoras.hidden = todoDia.checked;
    filaHasta.hidden = repeticion.value === "no";
    filaPrivado.hidden = quien.value !== yo;
  };
  inicio.addEventListener("change", () => { if (fin.value < inicio.value) fin.value = inicio.value; });
  [todoDia, repeticion, quien].forEach((x) => x.addEventListener("change", actualizar));
  actualizar();

  await dialogoFormulario(e ? "Editar" : "Nuevo en el calendario", [
    campo("Qué", h("input", { name: "titulo", value: base.titulo, required: true, maxlength: 120, autocomplete: "off" })),
    campo("De quién", quien),
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Tipo"), categorias),
    h("label", { class: "casilla" }, todoDia, h("span", {}, "Todo el día")),
    h("div", { class: "fila" }, campo("Empieza", inicio), campo("Acaba", fin)),
    filaHoras,
    campo("¿Se repite?", repeticion),
    filaHasta,
    campo("Dónde (opcional)", h("input", { name: "lugar", value: base.lugar ?? "", maxlength: 120, autocomplete: "off" })),
    campo("Notas (opcional)", h("textarea", { name: "notas", rows: 2, maxlength: 2000 }, base.notas ?? "")),
    campo("Aviso", h("select", { name: "aviso" },
      AVISOS_EVENTO.map((a) => h("option", { value: a.id, selected: base.aviso === a.id }, a.texto))),
    "Llega a quien le toca (a las dos si es de las dos), si tiene los avisos activados."),
    filaPrivado,
  ], e ? "Guardar" : "Añadir", async (d) => {
    const todo = d.get("todoElDia") === "on";
    const q = texto(d, "quien") as Quien;
    const rep = REPETICIONES.find((r) => r.valor === texto(d, "repeticion"))?.r ?? null;
    const ini = texto(d, "inicio");
    const hasta = texto(d, "hasta");
    const hi = texto(d, "horaInicio");
    const hf = texto(d, "horaFin");
    const nuevo: Evento = {
      ...base,
      titulo: texto(d, "titulo").trim(),
      quien: q,
      categoria: (texto(d, "categoria") || "plan") as Categoria,
      inicio: ini,
      fin: texto(d, "fin") || ini,
      todoElDia: todo,
      horaInicio: todo ? null : (esHora(hi) ? hi : null),
      horaFin: todo ? null : (esHora(hf) ? hf : null),
      repeticion: rep,
      hasta: rep && esFecha(hasta) ? hasta : null,
      excepciones: rep ? base.excepciones ?? [] : [],
      lugar: texto(d, "lugar").trim() || null,
      notas: texto(d, "notas").trim() || null,
      privado: q === yo && d.get("privado") === "on",
      aviso: (texto(d, "aviso") || "ninguno") as Evento["aviso"],
    };
    const p = problemaEvento(nuevo);
    if (p) throw new Error(p);
    await app.guardarEvento(nuevo, e);
    avisarEvento(app, nuevo, e);
    tostada(e ? "Guardado" : `Apuntado el ${fechaCorta(nuevo.inicio)} ✨`);
  });
}

// ---------------------------------------------------------------------------
// Horario habitual
// ---------------------------------------------------------------------------

const textoDias = (dias: number[]) => {
  const s = [...dias].sort().join(",");
  if (s === "1,2,3,4,5") return "De lunes a viernes";
  if (s === "6,7") return "Fines de semana";
  if (s === "1,2,3,4,5,6,7") return "Todos los días";
  return [...dias].sort().map((d) => LETRAS_DIA[d - 1]).join(" ");
};

export function textoBloque(b: BloqueHorario): string {
  return `${textoDias(b.dias)}, ${b.desde}–${b.hasta}${b.etiqueta ? ` · ${b.etiqueta}` : ""}`;
}

export function editarHorario(app: Merviri, persona: IdPersona = app.persona) {
  const nombre = app.pareja().personas[persona].nombre;
  const lista = h("ul", { class: "lista" });
  const error = h("p", { class: "error", role: "alert" });
  const actual = () => app.uno<Horario>(RUTA_HORARIOS, persona)?.bloques ?? [];
  const guardar = (bloques: BloqueHorario[]) => app.guardar<Horario>(RUTA_HORARIOS, { id: persona, bloques });

  const pintarLista = () => {
    const bloques = actual();
    lista.replaceChildren(...(bloques.length
      ? bloques.map((b, i) => h("li", {},
        h("span", { class: "crece" }, textoBloque(b)),
        h("button", {
          type: "button", class: "boton-icono", "aria-label": `Quitar ${textoBloque(b)}`,
          onclick: async () => { await guardar(bloques.filter((_, j) => j !== i)); pintarLista(); },
        }, "✕")))
      : [h("li", { class: "secundario" }, "Todavía no hay nada.")]));
  };

  const dias = h("div", { class: "selector-dias" }, LETRAS_DIA.map((l, i) => h("label", {},
    h("input", { type: "checkbox", name: "dia", value: i + 1, checked: i < 5 }), h("span", {}, l))));
  const desde = h("input", { type: "time", name: "desde", value: "09:00", required: true });
  const hasta = h("input", { type: "time", name: "hasta", value: "17:00", required: true });
  const etiqueta = h("input", { name: "etiqueta", value: "Trabajo", maxlength: 40 });
  const anadir = h("button", { type: "submit", class: "boton boton-primario" }, "Añadir");
  const form = h("form", { class: "formulario" },
    h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Días"), dias),
    h("div", { class: "fila" }, campo("Desde", desde), campo("Hasta", hasta)),
    campo("Qué es", etiqueta),
    error, h("div", {}, anadir));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    error.textContent = "";
    const d = new FormData(form);
    const b: BloqueHorario = {
      dias: d.getAll("dia").map(Number).sort(),
      desde: texto(d, "desde"), hasta: texto(d, "hasta"), etiqueta: texto(d, "etiqueta").trim(),
    };
    const p = problemaBloque(b);
    if (p) { error.textContent = p; return; }
    await guardar([...actual(), b]);
    pintarLista();
    tostada("Añadido");
  });

  const dlg = h("dialog", { class: "dialogo", "aria-labelledby": "dlg-horario" },
    h("h2", { id: "dlg-horario" }, `Horario habitual de ${nombre}`),
    h("p", { class: "secundario" }, "Las horas en que normalmente no estáis libres (trabajo, clases…). Se ven en la vista semanal y servirán para que Merviri os proponga planes cuando estéis libres."),
    lista,
    h("h3", { class: "arriba" }, "Añadir"),
    form,
    h("div", { class: "dialogo-acciones" }, h("button", { type: "button", class: "boton", onclick: () => dlg.close() }, "Cerrar")));
  dlg.addEventListener("close", () => { dlg.remove(); app.refrescar(); });
  pintarLista();
  document.body.appendChild(dlg);
  dlg.showModal();
}
