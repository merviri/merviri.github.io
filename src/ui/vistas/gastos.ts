import type { Merviri } from "../../app/app";
import { avisarGasto } from "../../app/eventos";
import { fechaCorta, hoy } from "../../dominio/fechas";
import {
  boteParaSaldar,
  CATEGORIAS_GASTO,
  comoSaldar,
  dinero,
  emojiGasto,
  esDeLasDos,
  exportarCsv,
  ID_CASA,
  leerImporte,
  MONEDAS,
  partes,
  participantes,
  problemaGasto,
  resumen,
  RUTA_BOTES,
  RUTA_FIJOS,
  rutaGastos,
  saldoEntreLasDos,
  saldos,
  type Bote,
  type CategoriaGasto,
  type Gasto,
  type GastoFijo,
  type ModoReparto,
  type Participante,
  type SaldoComun,
} from "../../dominio/gastos";
import { otraPersona } from "../../dominio/pareja";
import { tipoDeCambio } from "../../servicios/cambio";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { campo, conBoton, confirmarPeligro, descargar, dialogo, dialogoFormulario, h, tostada } from "../dom";
import { texto, volver } from "./comunes";

type Pestana = "gastos" | "resumen" | "fijos";
let pestana: Pestana = "gastos";
let mesResumen: string = hoy().slice(0, 7);

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const nombreMes = (m: string) => MES.format(new Date(`${m}-15T12:00:00Z`));
const sumarMes = (m: string, n: number) => {
  const t = +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

export const botes = (app: Merviri) => app.lista<Bote>(RUTA_BOTES);

function nombres(app: Merviri) {
  const p = app.pareja().personas;
  return { p1: p.p1.nombre, p2: p.p2.nombre };
}

function gente(app: Merviri, b: Bote): Participante[] {
  return participantes(b, nombres(app));
}

const nombreDe = (lista: Participante[], id: string) => lista.find((p) => p.id === id)?.nombre ?? "?";

/** El bote «Casa» existe siempre. */
export async function asegurarCasa(app: Merviri) {
  if (app.uno<Bote>(RUTA_BOTES, ID_CASA)) return;
  await app.guardar<Bote>(RUTA_BOTES, { id: ID_CASA, nombre: "Casa", emoji: "🏠", moneda: "EUR", amigos: [], archivado: false });
}

function textoSaldo(c: number, moneda: string): string {
  if (Math.abs(c) < 1) return "En paz ✨";
  return c > 0 ? `Le deben ${dinero(c, moneda)}` : `Debe ${dinero(-c, moneda)}`;
}

function miTextoSaldo(c: number, moneda: string): string {
  if (Math.abs(c) < 1) return "Estáis en paz ✨";
  return c > 0 ? `Te deben ${dinero(c, moneda)}` : `Debes ${dinero(-c, moneda)}`;
}

// ---------------------------------------------------------------------------
// Balance entre las dos (uno solo, sume lo que sume cada bote)
// ---------------------------------------------------------------------------

const botesConGastos = (app: Merviri) => botes(app).map((b) => ({ bote: b, gastos: app.lista<Gasto>(rutaGastos(b.id)) }));

/** Saldo común visto por mí: positivo = me deben. */
const miSaldo = (app: Merviri, p1: number) => (app.persona === "p1" ? p1 : -p1);

function textoComun(app: Merviri, p1: number, moneda: string): string {
  const mio = miSaldo(app, p1);
  const otra = app.pareja().personas[otraPersona(app.persona)].nombre;
  if (Math.abs(mio) < 1) return "Estáis en paz ✨";
  return mio > 0 ? `${otra} te debe ${dinero(mio, moneda)}` : `Le debes ${dinero(-mio, moneda)} a ${otra}`;
}

/** El balance entre las dos, por moneda (vacío si aún no hay gastos). */
export function balanceComun(app: Merviri): SaldoComun[] {
  return saldoEntreLasDos(botesConGastos(app));
}

async function saldarComun(app: Merviri, s: SaldoComun) {
  const deudor = s.p1 > 0 ? "p2" : "p1";
  const acreedor = otraPersona(deudor);
  const importe = Math.abs(s.p1);
  const ps = app.pareja().personas;
  const pregunta = deudor === app.persona
    ? `¿Apuntar que le has pagado ${dinero(importe, s.moneda)} a ${ps[acreedor].nombre}?`
    : `¿Apuntar que ${ps[deudor].nombre} te ha pagado ${dinero(importe, s.moneda)}?`;
  const r = await dialogo("Saldar", h("p", {}, `${pregunta} Quedaréis en paz.`), [
    { texto: "Cancelar", valor: "no" },
    { texto: "Sí, apuntar", valor: "si", tipo: "primario" },
  ]);
  if (r !== "si") return;
  const todos = botes(app);
  const b = todos.find((x) => x.id === boteParaSaldar(todos, s));
  if (!b) throw new Error("No hay ningún bote donde apuntar el pago.");
  await guardarMovimiento(app, b, {
    id: nuevoId(), tipo: "transferencia", concepto: "Pago", importe, original: null, pagadoPor: deudor,
    reparto: { modo: "iguales", entre: { [acreedor]: 1 } }, fecha: hoy(), categoria: "otros", nota: null, fijo: null,
  }, null);
  tostada("Apuntado: estáis en paz ✨");
}

/** El desglose sigue abierto aunque la pantalla se redibuje al sincronizar. */
let desgloseAbierto = false;

function tarjetaBalance(app: Merviri): HTMLElement | null {
  const lista = saldoEntreLasDos(botesConGastos(app));
  if (!lista.length) return null;
  const porId = new Map(botes(app).map((b) => [b.id, b]));
  return h("div", { class: "tarjeta tarjeta-morada balance-comun" },
    h("small", { class: "etiqueta-pregunta" }, "Entre vosotras"),
    lista.map((s) => {
      const enPaz = Math.abs(s.p1) < 1;
      const boton = h("button", { type: "button", class: "boton boton-primario boton-pequeno" }, "Saldar");
      boton.addEventListener("click", () => void conBoton(boton, () => saldarComun(app, s)));
      return h("div", { class: "linea-balance" },
        h("div", { class: "cabecera-vista" }, h("p", { class: "texto-balance" }, textoComun(app, s.p1, s.moneda)), enPaz ? null : boton),
        s.porBote.length > 1 && !enPaz
          ? h("details", { class: "desglose", open: desgloseAbierto, ontoggle: (ev: Event) => { desgloseAbierto = (ev.currentTarget as HTMLDetailsElement).open; } },
            h("summary", {}, "¿De dónde sale?"),
            h("ul", { class: "lista" }, s.porBote.map((x) => {
              const b = porId.get(x.bote);
              const mio = miSaldo(app, x.p1);
              return h("li", {},
                h("span", { class: "crece" }, b ? `${b.emoji} ${b.nombre}` : "?"),
                h("span", { class: mio > 0 ? "positivo" : "negativo" }, `${mio > 0 ? "+" : "−"}${dinero(Math.abs(mio), s.moneda)}`));
            })))
          : null);
    }),
  );
}

// ---------------------------------------------------------------------------
// Lista de botes
// ---------------------------------------------------------------------------

let casaPedida = false;

export function vistaGastos(app: Merviri): HTMLElement {
  if (!casaPedida && !app.uno<Bote>(RUTA_BOTES, ID_CASA)) {
    casaPedida = true;
    void asegurarCasa(app);
  }
  const lista = botes(app).sort((a, b) => (a.id === ID_CASA ? -1 : b.id === ID_CASA ? 1 : a.nombre.localeCompare(b.nombre, "es")));
  const fila = (b: Registro<Bote>) => {
    const gs = app.lista<Gasto>(rutaGastos(b.id));
    const total = resumen(gs).total;
    // Los botes de las dos solo dicen lo gastado; los de amigos llevan su propio balance.
    const sub = esDeLasDos(b)
      ? `${dinero(total, b.moneda)} gastados`
      : `Con ${b.amigos.map((a) => a.nombre).join(", ")} · ${miTextoSaldo(saldos(gs, gente(app, b).map((p) => p.id))[app.persona] ?? 0, b.moneda)} · ${dinero(total, b.moneda)} en total`;
    return h("li", {}, h("a", { class: "tarjeta-enlace", href: `#bote/${b.id}` },
      h("span", { class: "emoji-grande", "aria-hidden": "true" }, b.emoji),
      h("span", { class: "crece" }, h("b", {}, b.nombre),
        h("small", { class: "secundario" }, sub)),
      h("span", { class: "flecha", "aria-hidden": "true" }, "›")));
  };
  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Gastos"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarBote(app, null) }, "+ Bote")),
    tarjetaBalance(app),
    h("p", { class: "secundario pequeno arriba" }, "Entre vosotras hay un único balance, sume lo que sume cada bote. Los botes sirven para ver cuánto os ha costado cada cosa: «Casa» para el día a día y uno por viaje o plan. Si vienen amigos, ese bote lleva sus propias cuentas."),
    h("ul", { class: "tarjetas-lista" }, lista.filter((b) => !b.archivado).map(fila)),
    lista.some((b) => b.archivado)
      ? h("details", { class: "hechos" }, h("summary", {}, "Archivados"), h("ul", { class: "tarjetas-lista" }, lista.filter((b) => b.archivado).map(fila)))
      : null,
  );
}

// ---------------------------------------------------------------------------
// Un bote
// ---------------------------------------------------------------------------

export function vistaBote(app: Merviri, id: string): HTMLElement {
  const b = app.uno<Bote>(RUTA_BOTES, id);
  if (!b) return h("section", {}, volver("#gastos", "Gastos"), h("p", {}, id === ID_CASA ? "Preparando el bote…" : "Este bote ya no existe."));
  const ps = gente(app, b);
  const ids = ps.map((p) => p.id);
  const gs = app.lista<Gasto>(rutaGastos(b.id)).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.actualizado.localeCompare(x.actualizado));
  const s = saldos(gs, ids);
  const pagos = comoSaldar(s);

  const saldar = (de: string, a: string, importe: number) => h("button", {
    type: "button", class: "boton boton-pequeno",
    onclick: async () => {
      await guardarMovimiento(app, b, {
        id: nuevoId(), tipo: "transferencia", concepto: "Pago", importe, original: null, pagadoPor: de,
        reparto: { modo: "iguales", entre: { [a]: 1 } }, fecha: hoy(), categoria: "otros", nota: null, fijo: null,
      }, null);
      tostada("Apuntado como pagado ✨");
    },
  }, "Marcar pagado");

  const compartir = async () => {
    const lineas = [`${b.emoji} ${b.nombre}`, ...pagos.map((p) => `${nombreDe(ps, p.de)} → ${nombreDe(ps, p.a)}: ${dinero(p.importe, b.moneda)}`)];
    if (!pagos.length) lineas.push("¡Todo el mundo está en paz! ✨");
    const t = lineas.join("\n");
    if (typeof navigator.share === "function") await navigator.share({ title: b.nombre, text: t }).catch(() => undefined);
    else { await navigator.clipboard.writeText(t).catch(() => undefined); tostada("Resumen copiado"); }
  };

  return h("section", {},
    volver("#gastos", "Gastos"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, `${b.emoji} ${b.nombre}`),
      h("button", { type: "button", class: "boton", onclick: () => void editarBote(app, b) }, "Editar")),
    esDeLasDos(b) ? resumenBoteDeLasDos(app, b, ps, gs) : h("div", { class: "tarjeta" },
      h("ul", { class: "lista" }, ps.map((p) => h("li", {},
        h("span", { class: "crece" }, h("b", {}, p.nombre)),
        h("span", { class: (s[p.id] ?? 0) > 0 ? "positivo" : (s[p.id] ?? 0) < 0 ? "negativo" : "secundario" }, textoSaldo(s[p.id] ?? 0, b.moneda))))),
      pagos.length
        ? [h("h3", { class: "arriba" }, "Para quedar en paz"),
          h("ul", { class: "lista" }, pagos.map((p) => h("li", {},
            h("span", { class: "crece" }, `${nombreDe(ps, p.de)} → ${nombreDe(ps, p.a)}`, h("b", {}, dinero(p.importe, b.moneda))),
            saldar(p.de, p.a, p.importe))))]
        : null,
      b.amigos.length ? h("div", { class: "botones" }, h("button", { type: "button", class: "boton boton-pequeno", onclick: () => void compartir() }, "Compartir el resumen")) : null,
    ),
    h("div", { class: "botones" },
      h("button", { type: "button", class: "boton boton-primario", onclick: () => void editarGasto(app, b, null) }, "+ Gasto"),
      h("button", {
        type: "button", class: "boton",
        onclick: () => descargar(`merviri-gastos-${b.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.csv`, exportarCsv(gs, (x) => nombreDe(ps, x), b.moneda), "text/csv;charset=utf-8"),
      }, "Exportar (CSV)")),
    h("div", { class: "segmentado arriba" }, (["gastos", "resumen", "fijos"] as const).map((p) => h("button", {
      type: "button", role: "tab", "aria-selected": String(pestana === p), onclick: () => { pestana = p; app.refrescar(); },
    }, { gastos: "Movimientos", resumen: "Resumen", fijos: "Fijos" }[p]))),
    pestana === "gastos" ? listaMovimientos(app, b, ps, gs) : pestana === "resumen" ? vistaResumen(app, b, ps, gs) : vistaFijos(app, b, ps),
  );
}

/** Bote solo de las dos: cuánto ha costado y quién ha pagado; el balance es el común. */
function resumenBoteDeLasDos(app: Merviri, b: Bote, ps: Participante[], gs: Gasto[]): HTMLElement {
  const r = resumen(gs);
  const comun = balanceComun(app).find((s) => s.moneda === b.moneda);
  return h("div", { class: "tarjeta" },
    h("p", {}, "Gastado: ", h("b", {}, dinero(r.total, b.moneda))),
    r.total ? h("p", { class: "secundario pequeno" }, "Pagó: ", ps.filter((p) => r.porQuien.get(p.id)).map((p) => `${p.nombre} ${dinero(r.porQuien.get(p.id)!, b.moneda)}`).join(" · ")) : null,
    h("p", { class: "pequeno arriba" }, "Lo que os debéis va todo junto: ",
      h("a", { href: "#gastos" }, comun ? textoComun(app, comun.p1, b.moneda) : "Estáis en paz ✨"), " ›"),
  );
}

function listaMovimientos(app: Merviri, b: Bote, ps: Participante[], gs: Registro<Gasto>[]): HTMLElement {
  if (!gs.length) return h("p", { class: "secundario" }, "Todavía no hay gastos. Apuntad el primero con «+ Gasto».");
  const porMes = new Map<string, Registro<Gasto>[]>();
  for (const g of gs) porMes.set(g.fecha.slice(0, 7), [...(porMes.get(g.fecha.slice(0, 7)) ?? []), g]);
  return h("div", {}, [...porMes.entries()].map(([m, lista]) => h("div", {},
    h("h3", { class: "titulo-seccion" }, nombreMes(m)),
    h("ul", { class: "elementos" }, lista.map((g) => {
      const para = Object.keys(partes(g));
      const paraTexto = g.tipo === "transferencia" ? `a ${nombreDe(ps, para[0]!)}`
        : para.length === ps.length ? "para todos" : `para ${para.map((x) => nombreDe(ps, x)).join(" y ")}`;
      return h("li", {}, h("button", { type: "button", class: "elemento gasto", onclick: () => void editarGasto(app, b, g) },
        h("span", { class: "fila-gasto" },
          h("span", { class: "emoji-grande", "aria-hidden": "true" }, g.tipo === "transferencia" ? "💸" : emojiGasto(g.categoria)),
          h("span", { class: "crece" },
            h("b", {}, g.tipo === "transferencia" ? `${nombreDe(ps, g.pagadoPor)} pagó a ${nombreDe(ps, para[0]!)}` : g.concepto),
            h("small", { class: "secundario" }, `${fechaCorta(g.fecha)} · ${g.tipo === "gasto" ? `pagó ${nombreDe(ps, g.pagadoPor)} ${paraTexto}` : "pago"}${g.fijo ? " · fijo" : ""}`),
            g.original ? h("small", { class: "secundario" }, `${dinero(g.original.importe, g.original.moneda)} (cambio ${g.original.cambio})`) : null),
          h("b", { class: "importe" }, dinero(g.importe, b.moneda)))));
    })))));
}

function vistaResumen(app: Merviri, b: Bote, ps: Participante[], gs: Gasto[]): HTMLElement {
  const delMes = gs.filter((g) => g.fecha.startsWith(mesResumen));
  const r = resumen(delMes);
  const max = Math.max(1, ...r.porCategoria.map(([, v]) => v));
  return h("div", {},
    h("div", { class: "navegar-fecha" },
      h("button", { type: "button", class: "boton-icono", "aria-label": "Mes anterior", onclick: () => { mesResumen = sumarMes(mesResumen, -1); app.refrescar(); } }, "‹"),
      h("h2", {}, nombreMes(mesResumen)),
      h("button", { type: "button", class: "boton-icono", "aria-label": "Mes siguiente", onclick: () => { mesResumen = sumarMes(mesResumen, 1); app.refrescar(); } }, "›")),
    h("p", { class: "total-mes" }, dinero(r.total, b.moneda)),
    r.porCategoria.length
      ? h("ul", { class: "barras" }, r.porCategoria.map(([c, v]) => {
        const barra = h("span", { class: "barra" });
        barra.style.width = `${Math.max(3, (v / max) * 100)}%`;
        const cat = CATEGORIAS_GASTO.find((x) => x.id === c)!;
        return h("li", {}, h("span", { class: "etiqueta-barra" }, `${cat.emoji} ${cat.nombre}`), h("span", { class: "pista" }, barra), h("b", {}, dinero(v, b.moneda)));
      }))
      : h("p", { class: "secundario" }, "Sin gastos este mes."),
    r.total ? h("p", { class: "secundario arriba" }, "Pagado: ", ps.filter((p) => r.porQuien.get(p.id)).map((p) => `${p.nombre} ${dinero(r.porQuien.get(p.id)!, b.moneda)}`).join(" · ")) : null,
  );
}

function vistaFijos(app: Merviri, b: Bote, ps: Participante[]): HTMLElement {
  const fijos = app.lista<GastoFijo>(RUTA_FIJOS).filter((f) => f.bote === b.id);
  return h("div", {},
    h("p", { class: "secundario" }, "Se apuntan solos cada mes el día que elijáis (alquiler, luz, internet, suscripciones…)."),
    fijos.length
      ? h("ul", { class: "elementos" }, fijos.map((f) => h("li", {}, h("button", { type: "button", class: "elemento", onclick: () => void editarFijo(app, b, ps, f) },
        h("span", {}, `${emojiGasto(f.categoria)} ${f.concepto} · ${dinero(f.importe, b.moneda)}`),
        h("small", { class: "secundario" }, `Día ${f.dia} · paga ${nombreDe(ps, f.pagadoPor)}${f.activo ? "" : " · en pausa"}`)))))
      : null,
    h("div", { class: "botones" }, h("button", { type: "button", class: "boton", onclick: () => void editarFijo(app, b, ps, null) }, "+ Gasto fijo")),
  );
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

async function guardarMovimiento(app: Merviri, b: Bote, g: Gasto, previo: Gasto | null) {
  const p = problemaGasto(g, gente(app, b).map((x) => x.id));
  if (p) throw new Error(p);
  await app.guardar<Gasto>(rutaGastos(b.id), g);
  if (!previo) avisarGasto(app, b, g);
}

/** Controles de reparto: quién participa y cómo. */
function controlesReparto(ps: Participante[], inicial: Gasto["reparto"] | null) {
  const modo = h("select", { name: "modo" },
    h("option", { value: "iguales", selected: !inicial || inicial.modo === "iguales" }, "A partes iguales"),
    h("option", { value: "partes", selected: inicial?.modo === "partes" }, "Por partes (2 a 1…)"),
    h("option", { value: "importes", selected: inicial?.modo === "importes" }, "Importes exactos"));
  const filas = ps.map((p) => {
    const marcado = inicial ? (inicial.entre[p.id] ?? 0) > 0 : true;
    const valor = inicial && inicial.modo !== "iguales" && inicial.entre[p.id]
      ? (inicial.modo === "importes" ? (inicial.entre[p.id]! / 100).toFixed(2).replace(".", ",") : String(inicial.entre[p.id])) : "";
    const peso = h("input", { name: `peso-${p.id}`, value: valor, inputmode: "decimal", class: "corto", "aria-label": `Parte de ${p.nombre}` });
    return { p, fila: h("label", { class: "casilla fila-reparto" }, h("input", { type: "checkbox", name: "para", value: p.id, checked: marcado }), h("span", { class: "crece" }, p.nombre), peso), peso };
  });
  const actualizar = () => filas.forEach(({ peso }) => { peso.hidden = modo.value === "iguales"; });
  modo.addEventListener("change", actualizar);
  actualizar();
  const nodo = h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Para quién"), campo("Cómo se reparte", modo), filas.map((f) => f.fila));
  const leer = (d: FormData): Gasto["reparto"] => {
    const m = d.get("modo") as ModoReparto;
    const para = d.getAll("para").map(String);
    const entre: Record<string, number> = {};
    for (const id of para) {
      if (m === "iguales") entre[id] = 1;
      else if (m === "partes") entre[id] = Math.max(0, Number(String(d.get(`peso-${id}`) || "1").replace(",", ".")) || 0);
      else entre[id] = leerImporte(String(d.get(`peso-${id}`) || "")) ?? 0;
    }
    return { modo: m, entre };
  };
  return { nodo, leer };
}

export async function editarGasto(app: Merviri, b: Bote, g: Registro<Gasto> | null) {
  const ps = gente(app, b);
  if (g?.tipo === "transferencia") {
    if (await confirmarPeligro("Borrar el pago", `¿Borrar el pago de ${dinero(g.importe, b.moneda)}?`, "Borrar")) await app.borrar(rutaGastos(b.id), g.id);
    return;
  }
  const reparto = controlesReparto(ps, g?.reparto ?? (b.id === ID_CASA ? { modo: "iguales", entre: { p1: 1, p2: 1 } } : null));
  const moneda = h("select", { name: "moneda" }, MONEDAS.map((m) => h("option", { value: m, selected: (g?.original?.moneda ?? b.moneda) === m }, m)));
  const cambio = h("input", { name: "cambio", value: g?.original ? String(g.original.cambio).replace(".", ",") : "", inputmode: "decimal", class: "corto" });
  const botonCambio = h("button", { type: "button", class: "boton boton-pequeno" }, "Buscar cambio");
  const filaCambio = h("div", { class: "campo" }, h("label", {}, `Cambio (1 ${moneda.value} = ? ${b.moneda})`), h("div", { class: "fila" }, cambio, botonCambio));
  const actualizarMoneda = () => {
    filaCambio.hidden = moneda.value === b.moneda;
    filaCambio.querySelector("label")!.textContent = `Cambio (1 ${moneda.value} = ? ${b.moneda})`;
  };
  moneda.addEventListener("change", () => { cambio.value = ""; actualizarMoneda(); });
  botonCambio.addEventListener("click", () => void conBoton(botonCambio, async () => {
    cambio.value = String(await tipoDeCambio(moneda.value, b.moneda)).replace(".", ",");
  }));
  actualizarMoneda();
  let borrar = false;

  await dialogoFormulario(g ? "Editar gasto" : "Nuevo gasto", [
    campo("Concepto", h("input", { name: "concepto", value: g?.concepto ?? "", required: true, maxlength: 80, autocomplete: "off" })),
    h("div", { class: "fila" },
      campo("Importe", h("input", { name: "importe", value: g ? ((g.original?.importe ?? g.importe) / 100).toFixed(2).replace(".", ",") : "", inputmode: "decimal", required: true, autocomplete: "off" })),
      campo("Moneda", moneda)),
    filaCambio,
    campo("Pagó", h("select", { name: "pagadoPor" }, ps.map((p) => h("option", { value: p.id, selected: (g?.pagadoPor ?? app.persona) === p.id }, p.nombre)))),
    reparto.nodo,
    h("div", { class: "fila" },
      campo("Fecha", h("input", { type: "date", name: "fecha", value: g?.fecha ?? hoy(), required: true })),
      campo("Categoría", h("select", { name: "categoria" }, CATEGORIAS_GASTO.map((c) => h("option", { value: c.id, selected: (g?.categoria ?? "compra") === c.id }, `${c.emoji} ${c.nombre}`))))),
    campo("Nota (opcional)", h("input", { name: "nota", value: g?.nota ?? "", maxlength: 200 })),
    g ? h("button", { type: "button", class: "enlace-boton peligro", onclick: (ev: Event) => { borrar = true; (ev.target as HTMLElement).closest("form")!.requestSubmit(); } }, "Borrar el gasto") : null,
  ], g ? "Guardar" : "Añadir", async (d) => {
    if (g && borrar) {
      await app.borrar(rutaGastos(b.id), g.id);
      tostada("Gasto borrado", "info", { texto: "Deshacer", hacer: () => void app.guardar<Gasto>(rutaGastos(b.id), { ...g }) });
      return;
    }
    const imp = leerImporte(texto(d, "importe"));
    if (imp === null) throw new Error("El importe no es válido (por ejemplo: 12,50).");
    const mon = texto(d, "moneda") || b.moneda;
    let importe = imp;
    let original: Gasto["original"] = null;
    if (mon !== b.moneda) {
      const c = Number(texto(d, "cambio").replace(",", "."));
      if (!(c > 0)) throw new Error("Falta el tipo de cambio (pulsa «Buscar cambio» o escríbelo).");
      importe = Math.round(imp * c);
      original = { importe: imp, moneda: mon, cambio: c };
    }
    let rep = reparto.leer(d);
    if (rep.modo === "importes" && original) {
      // Los importes exactos se escriben en la moneda del gasto: se pasan a la del bote.
      const ent: Record<string, number> = {};
      for (const [k, v] of Object.entries(rep.entre)) ent[k] = Math.round(v * original.cambio);
      const dif = importe - Object.values(ent).reduce((a, x) => a + x, 0);
      const primero = Object.keys(ent).sort()[0];
      if (primero && Math.abs(dif) <= Object.keys(ent).length) ent[primero]! += dif;
      rep = { modo: "importes", entre: ent };
    }
    const nuevo: Gasto = {
      id: g?.id ?? nuevoId(), tipo: "gasto", concepto: texto(d, "concepto").trim(), importe, original,
      pagadoPor: texto(d, "pagadoPor"), reparto: rep, fecha: texto(d, "fecha"),
      categoria: (texto(d, "categoria") || "otros") as CategoriaGasto, nota: texto(d, "nota").trim() || null, fijo: g?.fijo ?? null,
    };
    await guardarMovimiento(app, b, nuevo, g);
    tostada(g ? "Guardado" : `Apuntado: ${dinero(importe, b.moneda)}`);
  });
}

async function editarFijo(app: Merviri, b: Bote, ps: Participante[], f: Registro<GastoFijo> | null) {
  const reparto = controlesReparto(ps, f?.reparto ?? { modo: "iguales", entre: { p1: 1, p2: 1 } });
  let borrar = false;
  await dialogoFormulario(f ? "Gasto fijo" : "Nuevo gasto fijo", [
    campo("Concepto", h("input", { name: "concepto", value: f?.concepto ?? "", required: true, maxlength: 80, placeholder: "Alquiler, luz, internet…" })),
    h("div", { class: "fila" },
      campo(`Importe (${b.moneda})`, h("input", { name: "importe", value: f ? (f.importe / 100).toFixed(2).replace(".", ",") : "", inputmode: "decimal", required: true })),
      campo("Día del mes", h("input", { type: "number", name: "dia", min: 1, max: 28, value: f?.dia ?? 1, required: true }))),
    campo("Paga", h("select", { name: "pagadoPor" }, ps.map((p) => h("option", { value: p.id, selected: (f?.pagadoPor ?? app.persona) === p.id }, p.nombre)))),
    reparto.nodo,
    campo("Categoría", h("select", { name: "categoria" }, CATEGORIAS_GASTO.map((c) => h("option", { value: c.id, selected: (f?.categoria ?? "facturas") === c.id }, `${c.emoji} ${c.nombre}`)))),
    h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "activo", checked: f?.activo ?? true }), h("span", {}, "Activo")),
    f ? h("button", { type: "button", class: "enlace-boton peligro", onclick: (ev: Event) => { borrar = true; (ev.target as HTMLElement).closest("form")!.requestSubmit(); } }, "Borrar el gasto fijo") : null,
  ], f ? "Guardar" : "Añadir", async (d) => {
    if (f && borrar) { await app.borrar(RUTA_FIJOS, f.id); return; }
    const imp = leerImporte(texto(d, "importe"));
    if (imp === null || imp <= 0) throw new Error("El importe no es válido.");
    const dia = Math.round(Number(texto(d, "dia")));
    if (!(dia >= 1 && dia <= 28)) throw new Error("El día tiene que estar entre 1 y 28.");
    const nuevo: GastoFijo = {
      id: f?.id ?? nuevoId(), bote: b.id, concepto: texto(d, "concepto").trim(), importe: imp, pagadoPor: texto(d, "pagadoPor"),
      reparto: reparto.leer(d), categoria: texto(d, "categoria") as CategoriaGasto, dia, activo: d.get("activo") === "on",
    };
    const p = problemaGasto({ ...nuevo, id: "x", tipo: "gasto", original: null, fecha: hoy(), nota: null, fijo: null }, ps.map((x) => x.id));
    if (p) throw new Error(p);
    await app.guardar<GastoFijo>(RUTA_FIJOS, nuevo);
    await app.aplicarGastosFijos();
  });
}

async function editarBote(app: Merviri, b: Registro<Bote> | null) {
  const amigos = h("textarea", { name: "amigos", rows: 2, placeholder: "Ana, Luis" }, (b?.amigos ?? []).map((a) => a.nombre).join(", "));
  let creado = "";
  await dialogoFormulario(b ? "Editar bote" : "Nuevo bote", [
    campo("Nombre", h("input", { name: "nombre", value: b?.nombre ?? "", required: true, maxlength: 50, placeholder: "Viaje a Lisboa" })),
    campo("Icono", h("input", { name: "emoji", value: b?.emoji ?? "🧳", maxlength: 4 })),
    campo("Moneda", h("select", { name: "moneda" }, MONEDAS.map((m) => h("option", { value: m, selected: (b?.moneda ?? "EUR") === m }, m)))),
    b?.id === ID_CASA ? null : campo("Amigos (además de vosotras), separados por comas", amigos, "No hace falta que tengan Merviri: solo el nombre."),
    b && b.id !== ID_CASA ? h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "archivado", checked: b.archivado }), h("span", {}, "Archivar (ya terminado)")) : null,
  ], b ? "Guardar" : "Crear", async (d) => {
    const nombre = texto(d, "nombre").trim();
    if (!nombre) throw new Error("Ponle un nombre.");
    const nombresAmigos = texto(d, "amigos").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);
    const previos = b?.amigos ?? [];
    const lista: Participante[] = nombresAmigos.map((n) => previos.find((a) => a.nombre === n) ?? { id: `a-${nuevoId().slice(0, 8)}`, nombre: n });
    // No se puede quitar a alguien que ya tiene gastos.
    if (b) {
      const usados = new Set(app.lista<Gasto>(rutaGastos(b.id)).flatMap((g) => [g.pagadoPor, ...Object.keys(g.reparto.entre)]));
      const quitados = previos.filter((a) => !lista.some((x) => x.id === a.id) && usados.has(a.id));
      if (quitados.length) throw new Error(`${quitados.map((q) => q.nombre).join(", ")} tiene gastos en este bote: no se puede quitar.`);
    }
    const nuevo: Bote = {
      id: b?.id ?? nuevoId(), nombre, emoji: texto(d, "emoji").trim() || "💶", moneda: texto(d, "moneda") || "EUR",
      amigos: b?.id === ID_CASA ? [] : lista, archivado: d.get("archivado") === "on",
    };
    await app.guardar<Bote>(RUTA_BOTES, nuevo);
    if (!b) creado = nuevo.id;
  });
  if (creado) location.hash = `#bote/${creado}`;
}

/** Para la portada: el balance entre las dos (todos los botes de las dos juntos). */
export function saldoComun(app: Merviri): { texto: string } | null {
  const lista = balanceComun(app);
  if (!lista.length) return null;
  return { texto: lista.map((s) => textoComun(app, s.p1, s.moneda)).join(" · ") };
}
