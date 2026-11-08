import type { Merviri } from "../../app/app";
import { RUTA_HORARIOS, type Horario } from "../../dominio/calendario";
import { fechaCorta, hoy, type Fecha } from "../../dominio/fechas";
import { CATALOGO } from "../../dominio/ideas";
import type { IdPersona } from "../../dominio/pareja";
import { PLAN_VACIO, type Plan } from "../../dominio/planes";
import { emojiTiempo, recomendar, textoMinutos, type Hueco, type Prevision, type Sugerencia } from "../../dominio/recomendar";
import { prevision, previsionGuardada, VALLADOLID } from "../../servicios/tiempo";
import { conBoton, h, tostada } from "../dom";
import { volver } from "./comunes";
import { planDeIdea } from "./descubrir";
import { diaLargo } from "./evento";
import { anadirPlan, corazones, fichasPlan, ganasTodas, planes, programarPlan } from "./planes";

let semanas = 3;
const descartados = new Set<string>();
let tiempoCargado = false;
let cargandoTiempo = false;

function textoHueco(h: Hueco): string {
  if (h.tipo === "finde") return `Fin de semana del ${fechaCorta(h.dia)} al ${fechaCorta(h.hastaDia)}`;
  if (h.tipo === "viaje") return `Del ${fechaCorta(h.dia)} al ${fechaCorta(h.hastaDia)} (libres las dos)`;
  if (h.tipo === "dia") return `${diaLargo(h.dia)}, todo el día`;
  return `${diaLargo(h.dia)}, libres de ${textoMinutos(h.desde)} a ${textoMinutos(h.hasta)}`;
}

const coords = (p: Plan) => (p.lugar?.lat != null && p.lugar.lon != null ? { lat: p.lugar.lat, lon: p.lugar.lon } : VALLADOLID);

/** Descarga la previsión de Valladolid y de los sitios de los planes (una vez por sesión y hora). */
async function cargarTiempo(app: Merviri) {
  if (cargandoTiempo) return;
  cargandoTiempo = true;
  const sitios = new Map<string, { lat: number; lon: number }>();
  sitios.set("vll", VALLADOLID);
  for (const p of planes(app)) if (p.estado === "idea") { const c = coords(p); sitios.set(`${c.lat.toFixed(2)},${c.lon.toFixed(2)}`, c); }
  await Promise.allSettled([...sitios.values()].slice(0, 12).map((c) => prevision(c.lat, c.lon)));
  tiempoCargado = true;
  cargandoTiempo = false;
  app.refrescar();
}

function tarjeta(app: Merviri, s: Sugerencia<Plan>, nueva: boolean): HTMLElement {
  const t: Prevision | null = s.prevision;
  const hacer = h("button", { type: "button", class: "boton boton-primario" }, nueva ? "＋ A planes y al calendario" : "📅 ¡Lo hacemos!");
  hacer.addEventListener("click", () => void conBoton(hacer, async () => {
    let plan = s.plan;
    if (nueva) {
      const id = await anadirPlan(app, { ...s.plan, titulo: s.plan.titulo });
      plan = app.uno<Plan>("datos/planes.json", id) ?? { ...s.plan, id };
    }
    await programarPlan(app, plan, s.hueco.dia, { hueco: s.hueco });
    descartados.add(s.plan.id);
    tostada(`¡Apuntado el ${fechaCorta(s.hueco.dia)}! ✨`);
    app.refrescar();
  }));
  return h("li", { class: "tarjeta sugerencia" },
    h("p", { class: "cuando" }, textoHueco(s.hueco)),
    t ? h("p", { class: "tiempo" }, `${emojiTiempo(t.codigo)} ${t.max}° / ${t.min}°${t.lluvia >= 20 ? ` · 💧 ${t.lluvia}%` : ""}${s.plan.lugar?.nombre ? ` en ${s.plan.lugar.nombre}` : ""}`)
      : s.plan.clima !== "da-igual" ? h("p", { class: "tiempo secundario" }, "Aún no hay previsión del tiempo para ese día.") : null,
    h("h3", {}, nueva ? `🆕 ${s.plan.titulo}` : s.plan.titulo),
    fichasPlan(s.plan),
    nueva ? h("p", { class: "secundario pequeno" }, "Del catálogo de ideas: aún no está en vuestros planes.") : h("p", {}, corazones(app, s.plan.id)),
    s.reservarAntesDe ? h("p", { class: "aviso-reserva" }, `📞 Hay que reservar antes del ${fechaCorta(s.reservarAntesDe)} (se creará la tarea).`) : null,
    h("div", { class: "botones" }, hacer,
      h("button", { type: "button", class: "boton", onclick: () => { descartados.add(s.plan.id); app.refrescar(); } }, "Otra")),
  );
}

export function vistaQueHacemos(app: Merviri): HTMLElement {
  if (!tiempoCargado) void cargarTiempo(app);
  const hoyF = hoy();
  const horarios: Partial<Record<IdPersona, Horario>> = {
    p1: app.uno<Horario>(RUTA_HORARIOS, "p1"), p2: app.uno<Horario>(RUTA_HORARIOS, "p2"),
  };
  const tiempo = (p: Plan, f: Fecha) => { const c = coords(p); return previsionGuardada(c.lat, c.lon, f); };
  const eventos = app.eventosConFestivos();
  const misPlanes = planes(app);
  const sugerencias = recomendar({ planes: misPlanes, ganas: ganasTodas(app), eventos, horarios, hoy: hoyF, dias: semanas * 7, tiempo, descartados });
  // Del catálogo: ideas que no están en vuestros planes, por si os apetece algo nuevo.
  const titulos = new Set(misPlanes.map((p) => p.titulo.toLowerCase()));
  const catalogo: Plan[] = CATALOGO.filter((i) => !titulos.has(i.titulo.toLowerCase()))
    .map((i) => ({ id: i.id, ...PLAN_VACIO, ...planDeIdea(i) }));
  const nuevas = recomendar({ planes: catalogo, ganas: [], eventos, horarios, hoy: hoyF, dias: semanas * 7, tiempo, descartados, max: 3 })
    .slice(0, 2);
  const sinHorario = !horarios.p1 && !horarios.p2;

  return h("section", {},
    volver("#planes", "Planes"),
    h("h1", {}, "¿Qué hacemos? ✨"),
    h("p", { class: "secundario" }, "Huecos en los que estáis libres las dos (calendario y horario habitual) con planes que encajan por duración, temporada, reserva y tiempo."),
    h("div", { class: "segmentado" }, [2, 3, 4].map((n) => h("button", {
      type: "button", "aria-selected": String(semanas === n), onclick: () => { semanas = n; app.refrescar(); },
    }, `${n} semanas`))),
    sinHorario ? h("div", { class: "aviso" }, h("p", {}, "Poned vuestro horario habitual (Calendario → 🕘) para que no os proponga planes en horas de trabajo."),
      h("a", { class: "boton", href: "#calendario" }, "Ir al calendario")) : null,
    cargandoTiempo ? h("p", { class: "secundario" }, "Mirando el tiempo…") : null,
    sugerencias.length
      ? h("ul", { class: "sugerencias" }, sugerencias.map((s) => tarjeta(app, s, false)))
      : h("div", { class: "tarjeta" },
        h("p", {}, misPlanes.some((p) => p.estado === "idea")
          ? "Ninguna de vuestras ideas encaja en los huecos libres (o ya las habéis descartado). Probad con más semanas, o añadid ideas."
          : "Todavía no tenéis ideas en Planes. Apuntad alguna o cogedlas de Descubrir."),
        h("div", { class: "botones" },
          h("a", { class: "boton boton-primario", href: "#descubrir" }, "🔎 Descubrir"),
          descartados.size ? h("button", { type: "button", class: "boton", onclick: () => { descartados.clear(); app.refrescar(); } }, "Volver a ver las descartadas") : null)),
    nuevas.length ? [h("h2", { class: "arriba-mas" }, "¿Y algo nuevo?"), h("ul", { class: "sugerencias" }, nuevas.map((s) => tarjeta(app, s, true)))] : null,
  );
}
