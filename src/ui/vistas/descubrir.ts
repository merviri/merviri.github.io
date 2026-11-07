import type { Merviri } from "../../app/app";
import { avisarEvento } from "../../app/eventos";
import type { Evento } from "../../dominio/calendario";
import { fechaCorta, hoy, type Fecha } from "../../dominio/fechas";
import { CATALOGO, FECHAS_ESPECIALES, proximaVez, reservaDe, type Idea } from "../../dominio/ideas";
import { COSTES, DURACIONES, SITIOS, type Plan, type Sitio } from "../../dominio/planes";
import { agendaValladolid, type EventoAgenda } from "../../servicios/agenda";
import { enlaceMapa, SITIOS_CERCA, TIPOS_SITIO, type TipoSitio } from "../../servicios/sitios";
import { nuevoId } from "../../util/bytes";
import { conBoton, h, tostada } from "../dom";
import { volver } from "./comunes";
import { diaLargo } from "./evento";
import { anadirPlan, planes } from "./planes";

type Pestana = "ideas" | "agenda" | "fechas" | "sitios";
let pestana: Pestana = "ideas";
let sitioIdeas: Sitio | null = null;
let infantiles = false;
let categoria: string | null = null;
let tipoSitio: TipoSitio | null = null;

// Lo que se descarta en Descubrir se recuerda en este dispositivo.
const CLAVE_DESCARTES = "merviri:descubrir-descartes";
function descartes(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE_DESCARTES) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function descartar(id: string) {
  const s = descartes();
  s.add(id);
  try { localStorage.setItem(CLAVE_DESCARTES, JSON.stringify([...s].slice(-500))); } catch { /* sin almacenamiento */ }
}

/** Planes a partir de una idea del catálogo (para «Añadir» y para el recomendador). */
export function planDeIdea(idea: Idea): Partial<Plan> & { titulo: string } {
  return {
    titulo: idea.titulo, duracion: idea.duracion, coste: idea.coste, clima: idea.clima, dificultad: idea.dificultad,
    sitio: idea.sitio, momentos: idea.momentos ?? [], meses: idea.meses ?? [], etiquetas: idea.etiquetas,
    reservaDias: reservaDe(idea), notas: idea.notas ?? null,
    plazo: idea.duracion === "viaje" || idea.duracion === "finde" ? "medio" : "corto",
  };
}

const yaEsta = (app: Merviri) => new Set(planes(app).map((p) => p.titulo.trim().toLowerCase()));

function botonAnadir(app: Merviri, base: Partial<Plan> & { titulo: string }, al?: () => void) {
  const b = h("button", { type: "button", class: "boton boton-pequeno boton-primario" }, "＋ A planes");
  b.addEventListener("click", () => void conBoton(b, async () => {
    const id = await anadirPlan(app, base);
    tostada("Añadido a vuestros planes ✨", "info", { texto: "Ver", hacer: () => { location.hash = `#plan/${id}`; } });
    al?.();
  }));
  return b;
}

// ---------------------------------------------------------------------------

function pestanaIdeas(app: Merviri): HTMLElement {
  const fuera = descartes();
  const ya = yaEsta(app);
  const ideas = CATALOGO.filter((i) => !fuera.has(i.id) && !ya.has(i.titulo.toLowerCase()) && (!sitioIdeas || i.sitio === sitioIdeas));
  return h("div", {},
    h("div", { class: "fichas" }, SITIOS.map((s) => h("button", {
      type: "button", class: "ficha", "aria-pressed": String(sitioIdeas === s.id),
      onclick: () => { sitioIdeas = sitioIdeas === s.id ? null : s.id; app.refrescar(); },
    }, s.texto))),
    ideas.length
      ? h("ul", { class: "tarjetas-lista" }, ideas.map((i) => h("li", { class: "tarjeta-enlace descubrir" },
        h("span", { class: "crece" },
          h("b", {}, i.titulo),
          h("span", { class: "meta" },
            h("span", {}, DURACIONES.find((d) => d.id === i.duracion)!.texto),
            h("span", {}, COSTES.find((c) => c.id === i.coste)!.simbolo),
            h("span", {}, SITIOS.find((s) => s.id === i.sitio)!.texto),
            i.etiquetas.slice(0, 2).map((e) => h("span", { class: "pastilla pastilla-morado" }, e)))),
        h("span", { class: "acciones" },
          botonAnadir(app, planDeIdea(i), () => app.refrescar()),
          h("button", { type: "button", class: "boton-icono", "aria-label": "No me interesa", title: "No me interesa", onclick: () => { descartar(i.id); app.refrescar(); } }, "✕")))))
      : h("p", { class: "secundario" }, "¡Ya tenéis todas las de aquí! Mirad la agenda o los sitios cercanos."),
  );
}

let agenda: { estado: "nada" | "cargando" | "lista" | "error"; datos: EventoAgenda[]; error?: string } = { estado: "nada", datos: [] };

async function alCalendario(app: Merviri, ev: EventoAgenda) {
  const e: Evento = {
    id: nuevoId(), titulo: ev.titulo, quien: "ambas", categoria: "plan", inicio: ev.inicio, fin: ev.fin && ev.fin >= ev.inicio ? ev.fin : ev.inicio,
    todoElDia: !ev.hora, horaInicio: ev.hora, horaFin: null, lugar: [ev.lugar, ev.localidad].filter(Boolean).join(", ") || null,
    notas: ev.enlace, repeticion: null, hasta: null, excepciones: [], privado: false, aviso: ev.hora ? "antes" : "manana",
  };
  await app.guardarEvento(e, null);
  avisarEvento(app, e, null);
  tostada(`Al calendario el ${fechaCorta(ev.inicio)} ✨`);
}

function pestanaAgenda(app: Merviri): HTMLElement {
  if (agenda.estado === "nada") {
    agenda = { estado: "cargando", datos: [] };
    void agendaValladolid(hoy()).then(
      (datos) => { agenda = { estado: "lista", datos }; app.refrescar(); },
      (e: Error) => { agenda = { estado: "error", datos: [], error: e.message }; app.refrescar(); },
    );
  }
  if (agenda.estado === "cargando") return h("p", { class: "secundario" }, "Mirando la agenda de Valladolid…");
  if (agenda.estado === "error") {
    return h("div", {}, h("p", { class: "error" }, agenda.error ?? "No se pudo leer la agenda."),
      h("button", { type: "button", class: "boton", onclick: () => { agenda = { estado: "nada", datos: [] }; app.refrescar(); } }, "Reintentar"));
  }
  const cats = [...new Set(agenda.datos.map((e) => e.categoria))].sort();
  const lista = agenda.datos.filter((e) => (infantiles || !e.infantil) && (!categoria || e.categoria === categoria));
  const porDia = new Map<Fecha, EventoAgenda[]>();
  for (const e of lista) {
    const d = e.inicio < hoy() ? hoy() : e.inicio;
    porDia.set(d, [...(porDia.get(d) ?? []), e]);
  }
  return h("div", {},
    h("div", { class: "fichas" },
      cats.map((c) => h("button", { type: "button", class: "ficha", "aria-pressed": String(categoria === c), onclick: () => { categoria = categoria === c ? null : c; app.refrescar(); } }, c)),
      h("button", { type: "button", class: "ficha", "aria-pressed": String(infantiles), onclick: () => { infantiles = !infantiles; app.refrescar(); } }, "Incluir infantiles")),
    lista.length
      ? [...porDia.entries()].map(([d, evs]) => h("section", { class: "dia-agenda" },
        h("h3", {}, diaLargo(d)),
        h("ul", { class: "tarjetas-lista" }, evs.map((e) => h("li", { class: "tarjeta-enlace descubrir" },
          h("span", { class: "crece" },
            h("b", {}, e.titulo),
            h("span", { class: "meta" },
              h("span", { class: "pastilla pastilla-morado" }, e.categoria),
              e.hora ? h("span", {}, `🕒 ${e.hora}`) : null,
              e.fin && e.fin !== e.inicio ? h("span", {}, `hasta el ${fechaCorta(e.fin)}`) : null,
              e.precio ? h("span", {}, `💶 ${e.precio}`) : null),
            h("small", { class: "secundario" }, [e.lugar, e.localidad].filter(Boolean).join(" · "))),
          h("span", { class: "acciones" },
            botonAnadir(app, {
              titulo: e.titulo, desde: e.inicio, hasta: e.fin ?? e.inicio, enlace: e.enlace, etiquetas: [e.categoria.toLowerCase()],
              duracion: "rato", plazo: "corto", sitio: e.localidad === "Valladolid" ? "ciudad" : "cerca", clima: "da-igual",
              lugar: e.lugar ? { nombre: [e.lugar, e.localidad].filter(Boolean).join(", "), lat: e.lat, lon: e.lon } : null,
              momentos: e.hora ? [+e.hora.slice(0, 2) < 14 ? "manana" : +e.hora.slice(0, 2) < 20 ? "tarde" : "noche"] : [],
            }),
            h("button", { type: "button", class: "boton boton-pequeno", onclick: () => void alCalendario(app, e) }, "📅"),
            e.enlace ? h("a", { class: "boton boton-pequeno", href: e.enlace, target: "_blank", rel: "noopener noreferrer", "aria-label": "Más información" }, "ℹ️") : null))))))
      : h("p", { class: "secundario" }, "No hay nada con estos filtros."),
    h("p", { class: "secundario pequeno arriba" }, "Datos abiertos de la agenda cultural de la Junta de Castilla y León."),
  );
}

function pestanaFechas(app: Merviri): HTMLElement {
  const hoyF = hoy();
  const ya = yaEsta(app);
  const fechas = FECHAS_ESPECIALES
    .map((f) => ({ f, cuando: proximaVez(f, hoyF) }))
    .filter((x): x is { f: (typeof FECHAS_ESPECIALES)[number]; cuando: [Fecha, Fecha] } => x.cuando !== null)
    .sort((a, b) => a.cuando[0].localeCompare(b.cuando[0]));
  return h("div", {},
    h("ul", { class: "tarjetas-lista" }, fechas.map(({ f, cuando }) => h("li", { class: "tarjeta-enlace descubrir" },
      h("span", { class: "crece" },
        h("b", {}, f.titulo),
        h("span", { class: "meta" }, h("span", { class: "pastilla pastilla-rosa" },
          cuando[0] === cuando[1] ? fechaCorta(cuando[0]) : `${fechaCorta(cuando[0])} – ${fechaCorta(cuando[1])}`)),
        h("small", { class: "secundario" }, f.notas)),
      ya.has(f.titulo.toLowerCase()) ? h("span", { class: "secundario pequeno" }, "✓ En planes")
        : h("span", { class: "acciones" }, botonAnadir(app, {
          titulo: f.titulo, desde: cuando[0], hasta: cuando[1], sitio: f.sitio, clima: f.clima, duracion: f.duracion, notas: f.notas,
          plazo: "corto", momentos: f.titulo.includes("estrellas") ? ["noche"] : [],
        }, () => app.refrescar()))))),
    h("p", { class: "secundario pequeno arriba" }, "Fechas aproximadas: comprobad las exactas cada año."),
  );
}

function pestanaSitios(app: Merviri): HTMLElement {
  const ya = yaEsta(app);
  const lista = SITIOS_CERCA.filter((s) => !tipoSitio || s.tipo === tipoSitio);
  return h("div", {},
    h("div", { class: "fichas" }, TIPOS_SITIO.map((t) => h("button", {
      type: "button", class: "ficha", "aria-pressed": String(tipoSitio === t.id), onclick: () => { tipoSitio = tipoSitio === t.id ? null : t.id; app.refrescar(); },
    }, `${t.emoji} ${t.nombre}`))),
    h("ul", { class: "tarjetas-lista" }, lista.map((s) => {
      const t = TIPOS_SITIO.find((x) => x.id === s.tipo)!;
      return h("li", { class: "tarjeta-enlace descubrir" },
        h("span", { class: "emoji-grande", "aria-hidden": "true" }, t.emoji),
        h("span", { class: "crece" }, h("b", {}, s.nombre), h("small", { class: "secundario" }, s.km <= 3 ? "En Valladolid" : `A unos ${s.km} km`)),
        h("span", { class: "acciones" },
          ya.has(s.nombre.toLowerCase()) ? h("span", { class: "secundario pequeno" }, "✓")
            : botonAnadir(app, {
              titulo: s.nombre, sitio: s.km <= 5 ? "ciudad" : s.km <= 80 ? "cerca" : "lejos", lugar: { nombre: s.nombre, lat: s.lat, lon: s.lon },
              duracion: s.km <= 5 ? "rato" : s.km <= 50 ? "media" : "dia", clima: s.tipo === "museo" ? "da-igual" : "sin-lluvia",
              coste: s.tipo === "museo" || s.tipo === "castillo" ? "bajo" : "gratis", etiquetas: [t.nombre.toLowerCase()], plazo: "corto",
            }, () => app.refrescar()),
          h("a", { class: "boton boton-pequeno", href: enlaceMapa(s.nombre), target: "_blank", rel: "noopener noreferrer", "aria-label": `Ver ${s.nombre} en el mapa` }, "🗺️")));
    })),
    h("p", { class: "secundario pequeno arriba" }, "¿Buscáis más? ",
      h("a", { href: enlaceMapa("miradores y rutas cerca de Valladolid"), target: "_blank", rel: "noopener noreferrer" }, "Buscar en el mapa"), "."),
  );
}

export function vistaDescubrir(app: Merviri): HTMLElement {
  const tab = (p: Pestana, t: string) => h("button", { type: "button", role: "tab", "aria-selected": String(pestana === p), onclick: () => { pestana = p; app.refrescar(); } }, t);
  return h("section", {},
    volver("#planes", "Planes"),
    h("h1", {}, "Descubrir"),
    h("div", { class: "segmentado cuatro", role: "tablist" }, tab("ideas", "Ideas"), tab("agenda", "Agenda"), tab("fechas", "Fechas"), tab("sitios", "Sitios")),
    pestana === "ideas" ? pestanaIdeas(app) : pestana === "agenda" ? pestanaAgenda(app) : pestana === "fechas" ? pestanaFechas(app) : pestanaSitios(app),
  );
}
