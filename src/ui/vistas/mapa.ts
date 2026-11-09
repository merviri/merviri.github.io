import type * as Leaflet from "leaflet";
import type { Merviri } from "../../app/app";
import { RUTA_ALBUMES, type Album } from "../../dominio/album";
import { fechaCorta } from "../../dominio/fechas";
import { conCoordenadas, puntosDelMapa, type PuntoMapa } from "../../dominio/mapa";
import { RUTA_PLANES, type Lugar, type Plan } from "../../dominio/planes";
import { buscarLugar } from "../../servicios/tiempo";
import { bloquearRedibujo } from "../bloqueo";
import { conBoton, h, tostada } from "../dom";
import { volver } from "./comunes";

/**
 * Mapa de «dónde hemos estado», como el de la web de Elvira: Leaflet con
 * OpenStreetMap. Leaflet se carga solo al abrir el mapa. Las teselas piden la
 * zona que se ve a OpenStreetMap (solo con el origen como «Referer», que lo
 * exigen); nada de vuestros datos sale del móvil.
 */
type L = typeof Leaflet;
let cargando: Promise<L> | null = null;
function cargarLeaflet(): Promise<L> {
  cargando ??= Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
    .then(([m]) => ((m as unknown as { default?: L }).default ?? (m as unknown as L)))
    .catch((e: unknown) => { cargando = null; throw e; });
  return cargando;
}

const VALLADOLID: [number, number] = [41.6523, -4.7245];
const TESELAS = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

function capa(Lf: L) {
  // OpenStreetMap pide un «Referer»: solo se manda el origen (merviri.github.io).
  return Lf.tileLayer(TESELAS, { maxZoom: 18, attribution: ATRIBUCION, referrerPolicy: "origin" } as Leaflet.TileLayerOptions);
}

const color = (v: string, porDefecto: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || porDefecto;

function puntos(app: Merviri): PuntoMapa[] {
  return puntosDelMapa({
    albumes: app.album?.albumes() ?? app.lista<Album>(RUTA_ALBUMES),
    planes: app.lista<Plan>(RUTA_PLANES),
    fotos: app.album?.fotos() ?? [],
  });
}

const detalle = (c: PuntoMapa["cosas"][number]) =>
  [c.desde ? fechaCorta(c.desde) : null, c.fotos ? `${c.fotos} foto${c.fotos === 1 ? "" : "s"}` : null, c.futuro ? "por hacer" : null].filter(Boolean).join(" · ");

/** Contenido del globo de un punto (con DOM, sin HTML). */
function globo(app: Merviri, p: PuntoMapa): HTMLElement {
  const portada = h("div", { class: "portada-globo" });
  const primero = p.cosas.find((c) => c.tipo === "album" && c.fotos);
  if (primero && app.album) {
    const fotos = app.album.fotos().filter((f) => !f.papelera && f.albumes.includes(primero.id));
    const f = fotos.find((x) => x.favorita) ?? fotos[0];
    if (f) void app.album.url(f, "mini").then((u) => portada.append(h("img", { src: u, alt: "" })), () => undefined);
  }
  return h("div", { class: "globo-mapa" },
    portada,
    h("b", {}, `📍 ${p.nombre}`),
    h("ul", {}, p.cosas.map((c) => h("li", {},
      h("a", { href: c.href }, `${c.emoji} ${c.titulo}`),
      detalle(c) ? h("small", {}, ` · ${detalle(c)}`) : null))));
}

export function vistaMapa(app: Merviri, enfocar = ""): HTMLElement {
  const ps = puntos(app);
  const caja = h("div", { class: "mapa", role: "region", "aria-label": "Mapa de los sitios" });
  // El mapa no se rehace con cada sincronización (se perdería el zoom).
  bloquearRedibujo(() => true);
  requestAnimationFrame(() => void pintarMapa(app, caja, ps, enfocar));
  return h("section", {},
    volver("#mas", "Más"),
    h("h1", {}, "🗺️ Dónde hemos estado"),
    caja,
    h("p", { class: "secundario pequeno" }, "● Con fotos o hecho  ◌ Planeado. Toca un punto para ir a su álbum o plan."),
    ps.length
      ? h("ul", { class: "elementos arriba" }, ps.map((p) => h("li", {},
        h("button", { type: "button", class: "elemento en-fila", onclick: () => { location.hash = `#mapa/${p.cosas[0]!.id}`; } },
          h("span", { class: "crece" }, h("b", {}, `📍 ${p.nombre}`), h("small", { class: "secundario bloque" }, p.cosas.map((c) => `${c.emoji} ${c.titulo}`).join(" · "))),
          h("span", { class: "flecha", "aria-hidden": "true" }, "›")))))
      : h("div", { class: "tarjeta arriba" },
        h("p", {}, h("b", {}, "Aún no hay sitios en el mapa")),
        h("p", {}, "Poned dónde fue cada álbum (📍 al editarlo) o el sitio de un plan, y aparecerá aquí. Al tocar el punto, vais a su álbum."),
        h("a", { class: "boton", href: "#album" }, "Ir al álbum")),
  );
}

async function pintarMapa(app: Merviri, caja: HTMLElement, ps: PuntoMapa[], enfocar: string) {
  let Lf: L;
  try {
    Lf = await cargarLeaflet();
  } catch {
    caja.replaceChildren(h("p", { class: "secundario centro" }, "No se pudo cargar el mapa. ¿Hay conexión?"));
    return;
  }
  if (!caja.isConnected) return;
  const mapa = Lf.map(caja, { scrollWheelZoom: false, worldCopyJump: true });
  capa(Lf).addTo(mapa);
  window.addEventListener("hashchange", () => mapa.remove(), { once: true });
  const rosa = color("--rosa", "#D4537E");
  const morado = color("--morado", "#534AB7");
  let abrir: Leaflet.CircleMarker | null = null;
  for (const p of ps) {
    const fotos = p.cosas.reduce((n, c) => n + c.fotos, 0);
    const futuro = p.cosas.every((c) => c.futuro);
    const m = Lf.circleMarker([p.lat, p.lon], {
      radius: 7 + 2.4 * Math.sqrt(p.cosas.length + fotos / 10), color: morado, weight: 2,
      fillColor: rosa, fillOpacity: futuro ? 0.12 : 0.55, dashArray: futuro ? "4 4" : undefined,
    }).addTo(mapa).bindPopup(() => globo(app, p), { maxWidth: 260 });
    if (enfocar && p.cosas.some((c) => c.id === enfocar)) abrir = m;
  }
  if (abrir) {
    mapa.setView(abrir.getLatLng(), 12);
    abrir.openPopup();
  } else if (ps.length) {
    mapa.fitBounds(ps.map((p) => [p.lat, p.lon] as [number, number]), { padding: [32, 32], maxZoom: 11 });
  } else {
    mapa.setView(VALLADOLID, 6);
  }
}

// ---------------------------------------------------------------------------
// Elegir un lugar (para un álbum)
// ---------------------------------------------------------------------------

/**
 * Campo para poner dónde fue algo: buscarlo por nombre, «estoy aquí» o
 * tocar en un mapa pequeño. Para ir dentro de un formulario.
 */
export function campoLugar(inicial: Lugar | null | undefined, nombrePorDefecto: () => string): { nodo: HTMLElement; valor: () => Lugar | null } {
  let lugar: Lugar | null = inicial ?? null;
  const texto = h("input", { name: "lugar-nombre", value: lugar?.nombre ?? "", maxlength: 80, autocomplete: "off", placeholder: "Lisboa, Segovia, Playa de…" });
  const estado = h("p", { class: "ayuda" });
  const resultados = h("div", { class: "resultados-lugar" });
  const cajaMapa = h("div", { class: "mapa mapa-pequeno", hidden: true });
  let mapa: Leaflet.Map | null = null;
  let marca: Leaflet.CircleMarker | null = null;

  const pintarEstado = () => {
    estado.textContent = conCoordenadas(lugar) ? `📍 ${lugar.nombre}: sale en el mapa ✓`
      : lugar?.nombre ? "Búscalo o elígelo en el mapa para que salga en el mapa."
      : "Opcional: para verlo en el mapa de sitios.";
  };
  const ponerMarca = async () => {
    if (!mapa || !conCoordenadas(lugar)) return;
    const Lf = await cargarLeaflet();
    if (marca) marca.setLatLng([lugar.lat, lugar.lon]);
    else marca = Lf.circleMarker([lugar.lat, lugar.lon], { radius: 9, color: color("--morado", "#534AB7"), fillColor: color("--rosa", "#D4537E"), fillOpacity: 0.6 }).addTo(mapa);
  };
  const elegir = (l: Lugar) => {
    lugar = l;
    texto.value = l.nombre;
    resultados.replaceChildren();
    pintarEstado();
    void ponerMarca();
    if (mapa && conCoordenadas(l)) mapa.setView([l.lat, l.lon], Math.max(mapa.getZoom(), 10));
  };

  texto.addEventListener("input", () => {
    const n = texto.value.trim();
    lugar = n ? { nombre: n, lat: lugar?.lat ?? null, lon: lugar?.lon ?? null } : null;
    pintarEstado();
  });
  const buscar = h("button", { type: "button", class: "boton boton-pequeno" }, "Buscar");
  const hacerBusqueda = () => void conBoton(buscar, async () => {
    if (!texto.value.trim()) { tostada("Escribe el nombre del sitio"); return; }
    const rs = await buscarLugar(texto.value);
    resultados.replaceChildren(...(rs.length
      ? rs.map((r) => h("button", { type: "button", class: "ficha", onclick: () => elegir({ nombre: r.nombre, lat: r.lat, lon: r.lon }) },
        `${r.nombre}${r.detalle ? ` (${r.detalle})` : ""}`))
      : [h("p", { class: "ayuda" }, "No lo encuentro. Prueba con el pueblo o la ciudad, o elígelo en el mapa.")]));
  });
  buscar.addEventListener("click", hacerBusqueda);
  // Intro en el nombre busca (y no envía el formulario).
  texto.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); hacerBusqueda(); } });

  const aqui = h("button", { type: "button", class: "boton boton-pequeno" }, "📍 Estoy aquí");
  aqui.addEventListener("click", () => void conBoton(aqui, () => new Promise<void>((ok, mal) => {
    if (!("geolocation" in navigator)) { mal(new Error("Este dispositivo no da la ubicación.")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { elegir({ nombre: texto.value.trim() || nombrePorDefecto(), lat: +pos.coords.latitude.toFixed(5), lon: +pos.coords.longitude.toFixed(5) }); ok(); },
      () => mal(new Error("No se pudo saber dónde estás (¿permiso de ubicación?).")),
      { enableHighAccuracy: true, timeout: 15_000 });
  })));

  const enMapa = h("button", { type: "button", class: "boton boton-pequeno" }, "🗺️ En el mapa");
  enMapa.addEventListener("click", () => void conBoton(enMapa, async () => {
    cajaMapa.hidden = false;
    if (mapa) return;
    const Lf = await cargarLeaflet();
    mapa = Lf.map(cajaMapa, { scrollWheelZoom: false });
    capa(Lf).addTo(mapa);
    mapa.setView(conCoordenadas(lugar) ? [lugar.lat, lugar.lon] : VALLADOLID, conCoordenadas(lugar) ? 11 : 6);
    mapa.on("click", (ev: Leaflet.LeafletMouseEvent) => {
      elegir({ nombre: texto.value.trim() || nombrePorDefecto(), lat: +ev.latlng.lat.toFixed(5), lon: +ev.latlng.lng.toFixed(5) });
    });
    void ponerMarca();
    // Dentro de un diálogo, el tamaño se sabe cuando ya se ve.
    setTimeout(() => mapa?.invalidateSize(), 50);
    tostada("Toca en el mapa dónde fue");
  }));

  const quitar = h("button", { type: "button", class: "enlace-boton" }, "Quitar");
  quitar.addEventListener("click", () => {
    lugar = null;
    texto.value = "";
    marca?.remove();
    marca = null;
    resultados.replaceChildren();
    pintarEstado();
  });

  pintarEstado();
  const nodo = h("div", { class: "campo" },
    h("label", {}, "📍 Dónde fue"),
    h("div", { class: "fila" }, texto, buscar),
    resultados,
    h("div", { class: "botones" }, aqui, enMapa, quitar),
    cajaMapa,
    estado);
  return { nodo, valor: () => lugar };
}
