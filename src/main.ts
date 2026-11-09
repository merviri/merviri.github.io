import "@fontsource-variable/nunito";
import "./ui/estilos.css";
import { Merviri, VERSION_APP, type CrearRemoto } from "./app/app";
import { codigoDeHash } from "./cifrado/vinculo";
import { ClienteGitHub } from "./github/cliente";
import { ClienteFotos, FotosMemoria } from "./github/fotos";
import { AlmacenIdb } from "./local/almacen";
import { hoy } from "./dominio/fechas";
import { esMia, RUTA_TAREAS, type Tarea } from "./dominio/tareas";
import { RUTA_DISPOSITIVOS } from "./dominio/dispositivos";
import { RUTA_PLAN } from "./dominio/avisos";
import { bloquearRedibujo, redibujoBloqueado } from "./ui/bloqueo";
import { dialogo, h, icono, tostada } from "./ui/dom";
import { vistaAjustes } from "./ui/vistas/ajustes";
import { vistaBienvenida } from "./ui/vistas/bienvenida";
import { vistaCalendario } from "./ui/vistas/calendario";
import { vistaDescubrir } from "./ui/vistas/descubrir";
import { vistaBote, vistaGastos } from "./ui/vistas/gastos";
import { vistaAlbum, vistaFoto } from "./ui/vistas/album";
import { vistaCompartido } from "./ui/vistas/compartido";
import { vistaMapa } from "./ui/vistas/mapa";
import { vistaMas } from "./ui/vistas/mas";
import { actualizarFestivosLocales } from "./servicios/festivos";
import { pendientesNosotras, vistaCapsulas, vistaDecidir, vistaDeseos, vistaFicha, vistaNosotras, vistaNuestroAnio, vistaPreguntas, vistaVotacion } from "./ui/vistas/juntas";
import { esIdPersona, type IdPersona } from "./dominio/pareja";
import { vistaMenu, vistaReceta, vistaRecetas } from "./ui/vistas/menu";
import { vistaPlan, vistaPlanes } from "./ui/vistas/planes";
import { vistaQueHacemos } from "./ui/vistas/quehacemos";
import { avisarDibujoNuevo, dibujosSinVer, vistaDibujar, vistaDibujo, vistaDibujos } from "./ui/vistas/dibujos";
import { vistaInicio } from "./ui/vistas/inicio";
import { vistaLista, vistaListas } from "./ui/vistas/listas";
import { vistaNota, vistaNotas } from "./ui/vistas/notas";
import { vistaTareas } from "./ui/vistas/tareas";
import { vistaToken } from "./ui/vistas/token";
import { vistaVincularOtro } from "./ui/vistas/vincular";

const DEV = import.meta.env.DEV;

// En desarrollo, ?dispositivo=2 simula otro dispositivo (otro almacenamiento local).
const params = new URLSearchParams(location.search);
const sufijo = DEV && params.get("dispositivo") ? `-${params.get("dispositivo")}` : "";

let crearRemoto: CrearRemoto = (c) => new ClienteGitHub(c);
if (DEV) {
  const { remotoFalso } = await import("./dev/falso");
  crearRemoto = (c) => (c.token.startsWith("falso") ? remotoFalso(`${c.propietario}/${c.repositorio}`) : new ClienteGitHub(c));
}

const app = new Merviri(new AlmacenIdb(`merviri${sufijo}`), crearRemoto);
{
  // Repositorios de fotos: en desarrollo (token «falso…») van en memoria.
  const falsos = new Map<string, FotosMemoria>();
  app.usarFotos((c, nombre) => {
    if (DEV && c.token.startsWith("falso")) {
      let r = falsos.get(nombre);
      if (!r) { r = new FotosMemoria(nombre); falsos.set(nombre, r); }
      return r;
    }
    return new ClienteFotos(c.propietario, nombre, c.token);
  });
}

// El código de un enlace de vinculación se guarda en memoria y se quita de la barra de direcciones.
let codigoVinculo = codigoDeHash(location.hash);
if (codigoVinculo) history.replaceState(null, "", `${location.pathname}${location.search}#inicio`);

/** Rutas: «#nombre» o «#nombre/parámetro». */
const VISTAS: Record<string, (a: Merviri, param: string) => HTMLElement> = {
  inicio: (a) => vistaInicio(a),
  calendario: (a, p) => vistaCalendario(a, p),
  mas: (a) => vistaMas(a),
  planes: (a) => vistaPlanes(a),
  gastos: (a) => vistaGastos(a),
  menu: (a) => vistaMenu(a),
  album: (a, p) => vistaAlbum(a, p),
  foto: (a, p) => vistaFoto(a, p),
  compartido: (a) => vistaCompartido(a),
  mapa: (a, p) => vistaMapa(a, p),
  nosotras: (a) => vistaNosotras(a),
  pregunta: (a) => vistaPreguntas(a),
  decidir: (a) => vistaDecidir(a),
  votacion: (a, p) => vistaVotacion(a, p),
  capsulas: (a) => vistaCapsulas(a),
  ficha: (a, p) => vistaFicha(a, p as IdPersona),
  deseos: (a, p) => vistaDeseos(a, p as IdPersona),
  "nuestro-ano": (a, p) => vistaNuestroAnio(a, p),
  recetas: (a) => vistaRecetas(a),
  receta: (a, p) => vistaReceta(a, p),
  bote: (a, p) => vistaBote(a, p),
  plan: (a, p) => vistaPlan(a, p),
  descubrir: (a) => vistaDescubrir(a),
  "que-hacemos": (a) => vistaQueHacemos(a),
  listas: (a) => vistaListas(a),
  lista: (a, p) => vistaLista(a, p),
  tareas: (a) => vistaTareas(a),
  notas: (a) => vistaNotas(a),
  nota: (a, p) => vistaNota(a, p),
  dibujos: (a) => vistaDibujos(a),
  dibujar: (a, p) => vistaDibujar(a, p || undefined),
  dibujo: (a, p) => vistaDibujo(a, p),
  ajustes: (a) => vistaAjustes(a),
  "vincular-otro": (a) => vistaVincularOtro(a),
  token: (a) => vistaToken(a),
};
/** Pestaña de la barra inferior a la que pertenece cada ruta. */
const PESTANA: Record<string, string> = {
  lista: "listas", plan: "planes", gastos: "mas", bote: "mas", menu: "mas", recetas: "mas", receta: "mas", album: "mas", foto: "mas", mapa: "mas", nosotras: "mas", pregunta: "mas", decidir: "mas", votacion: "mas", capsulas: "mas", ficha: "mas", deseos: "mas", "nuestro-ano": "mas", descubrir: "planes", "que-hacemos": "planes", notas: "mas", nota: "mas", dibujos: "mas", dibujar: "mas", dibujo: "mas", ajustes: "mas", "vincular-otro": "mas", token: "mas",
};

function ruta(): { nombre: string; param: string } {
  const [nombre = "", ...resto] = location.hash.slice(1).split("/");
  const param = resto.join("/");
  if (!(nombre in VISTAS)) return { nombre: "inicio", param: "" };
  if (["lista", "nota", "dibujo", "plan", "bote", "receta", "foto", "votacion"].includes(nombre) && !/^[A-Za-z0-9_-]{1,40}$/.test(param)) return { nombre: "inicio", param: "" };
  if ((nombre === "album" || nombre === "mapa") && param && !/^[A-Za-z0-9_-]{1,60}$/.test(param)) return { nombre, param: "" };
  if ((nombre === "ficha" || nombre === "deseos") && !esIdPersona(param)) return { nombre: "nosotras", param: "" };
  if (nombre === "nuestro-ano" && param && !/^\d{4}$/.test(param)) return { nombre, param: "" };
  if (nombre === "calendario" && param && !/^\d{4}-\d{2}-\d{2}$/.test(param)) return { nombre, param: "" };
  return { nombre, param };
}

const principal = document.getElementById("principal")!;
const estado = document.getElementById("estado")!;
const avisos = document.getElementById("avisos")!;
const irAjustes = document.getElementById("ir-ajustes")!;
const navegacion = document.getElementById("navegacion")!;
irAjustes.replaceChildren(icono("ajustes"));

function pintarNavegacion() {
  navegacion.hidden = app.fase !== "lista";
  if (app.fase !== "lista") return;
  const actual = PESTANA[ruta().nombre] ?? ruta().nombre;
  const yo = app.persona;
  const tareasHoy = app.lista<Tarea>(RUTA_TAREAS)
    .filter((t) => !t.hecha && esMia(t, yo) && t.fecha !== null && t.fecha <= hoy()).length;
  const dibujosNuevos = dibujosSinVer(app).length + pendientesNosotras(app);
  const pestanas: [string, string, string, number][] = [
    ["inicio", "🏠", "Inicio", 0],
    ["calendario", "📅", "Calendario", 0],
    ["planes", "✨", "Planes", 0],
    ["tareas", "✅", "Tareas", tareasHoy],
    ["listas", "📝", "Listas", 0],
    ["mas", "☰", "Más", dibujosNuevos],
  ];
  navegacion.replaceChildren(...pestanas.map(([id, emoji, nombre, n]) =>
    h("a", { href: `#${id}`, class: "pestana", "aria-current": actual === id ? "page" : undefined },
      h("span", { class: "emoji", "aria-hidden": "true" }, emoji),
      h("span", {}, nombre),
      n ? h("span", { class: "insignia", "aria-label": `${n} pendiente${n === 1 ? "" : "s"}` }, String(n)) : null)));
}

let faseMontada: string | null = null;
let pendiente = false;
let nuevaVersion = false;

function pintarEstado() {
  if (app.fase !== "lista") {
    estado.replaceChildren();
    return;
  }
  const e = app.estadoSync;
  const pend = app.motor?.pendientes() ?? 0;
  const [clase, textoEstado] =
    e.tipo === "sincronizado" ? ["ok", "Al día"]
    : e.tipo === "pendiente" && e.motivo === "sin-red" ? ["espera", pend ? `Sin conexión (${pend})` : "Sin conexión"]
    : e.tipo === "pendiente" ? ["mal", "Error al sincronizar"]
    : e.tipo === "credenciales" ? ["mal", "Revisa el token"]
    : ["va", "Sincronizando…"];
  const boton = h("button", { type: "button", title: "Sincronizar ahora" },
    h("span", { class: `punto ${clase}`, "aria-hidden": "true" }), textoEstado);
  boton.addEventListener("click", () => {
    if ((e.tipo === "pendiente" && e.motivo === "error") || e.tipo === "credenciales") {
      void dialogo("Sincronización", h("p", {}, e.mensaje ?? "Error desconocido."), [{ texto: "Reintentar", valor: "ok", tipo: "primario" }])
        .then((v) => { if (v) void app.sincronizar(); });
    } else {
      void app.sincronizar();
    }
  });
  estado.replaceChildren(boton);
}

function pintarAvisos() {
  const lista: HTMLElement[] = [];
  if (nuevaVersion) {
    lista.push(h("div", { class: "aviso" },
      h("p", {}, "Hay una versión nueva de Merviri ✨"),
      h("button", { type: "button", class: "boton boton-primario", onclick: () => location.reload() }, "Actualizar")));
  }
  if (app.fase === "lista") {
    const t = app.estadoToken();
    if (t.tipo === "caduca-pronto") {
      lista.push(h("div", { class: "aviso" },
        h("p", {}, `El acceso a GitHub caduca en ${t.quedan} ${t.quedan === 1 ? "día" : "días"}. Renovadlo para no tener que volver a vincular.`),
        h("a", { class: "boton", href: "#token" }, "Renovar")));
    } else if (t.tipo === "caducado" || app.estadoSync.tipo === "credenciales") {
      lista.push(h("div", { class: "aviso aviso-error" },
        h("p", {}, "GitHub no acepta el token de este dispositivo. Si ya se renovó en otro, vuelve a vincular este con un QR; si no, renuévalo."),
        h("a", { class: "boton", href: "#token" }, "Renovar")));
    }
  }
  avisos.replaceChildren(...lista);
}

/** Campos de texto: mientras se escribe en ellos no se redibuja desde fuera. */
function escribiendoEn(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!el || !principal.contains(el)) return false;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "range", "color"].includes((el as HTMLInputElement).type);
}

function pintar(deFondo = false) {
  pintarEstado();
  pintarAvisos();
  pintarNavegacion();
  irAjustes.hidden = app.fase !== "lista";

  if (app.fase === "cargando") {
    principal.replaceChildren(h("p", { class: "secundario centro" }, "Abriendo Merviri…"));
    faseMontada = "cargando";
    return;
  }
  if (app.fase === "sin-configurar") {
    // El asistente guarda su propio estado: solo se monta una vez.
    if (faseMontada !== "sin-configurar") {
      principal.replaceChildren(vistaBienvenida(app, codigoVinculo));
      faseMontada = "sin-configurar";
    }
    return;
  }
  if (codigoVinculo) {
    codigoVinculo = null;
    tostada("Este dispositivo ya está vinculado a Merviri.");
  }
  // Lo que llega de fondo no redibuja mientras se escribe, hay un diálogo abierto
  // o la pantalla lo pide (el lienzo). Excepción: los campos marcados como
  // «refrescables» (añadir a una lista), que se redibujan conservando lo escrito.
  const activo = document.activeElement;
  let conservar: { nombre: string; valor: string; inicio: number | null } | null = null;
  if (deFondo && faseMontada === "lista") {
    const refrescable = escribiendoEn(activo) && activo.hasAttribute("data-refrescable");
    if ((escribiendoEn(activo) && !refrescable) || document.querySelector("dialog[open]") || redibujoBloqueado()) {
      pendiente = true;
      return;
    }
    if (refrescable) {
      const campo = activo as HTMLInputElement;
      conservar = { nombre: campo.name, valor: campo.value, inicio: campo.selectionStart };
    }
  }
  pendiente = false;
  faseMontada = "lista";
  const { nombre, param } = ruta();
  const y = window.scrollY;
  principal.replaceChildren(VISTAS[nombre]!(app, param));
  if (deFondo) window.scrollTo(0, y);
  if (conservar) {
    const nuevo = principal.querySelector<HTMLInputElement>(`input[name="${conservar.nombre}"]`);
    if (nuevo) {
      nuevo.value = conservar.valor;
      nuevo.focus({ preventScroll: true });
      if (conservar.inicio !== null) nuevo.setSelectionRange(conservar.inicio, conservar.inicio);
    }
  }
  if (!["dibujar", "dibujo"].includes(nombre)) avisarDibujoNuevo(app);
}

/** Lo que cambia solo a menudo y no merece redibujar la pantalla (sí la cabecera). */
const SILENCIOSAS = new Set(["__estado__", RUTA_DISPOSITIVOS, RUTA_PLAN]);
/**
 * Has escrito algo en la pantalla que aún no se ha guardado: lo que llegue de
 * la otra espera hasta que guardes o cambies de pantalla (así no se pierde).
 */
let ocupada = false;
principal.addEventListener("input", (ev) => { if (escribiendoEn(ev.target as Element)) ocupada = true; });

function pintarCabecera() {
  pintarEstado();
  pintarAvisos();
  pintarNavegacion();
}

app.alCambiar((motivo) => {
  if (motivo === "fase" || motivo === "manual" || motivo === "token") {
    if (motivo === "manual") ocupada = false;
    pintar(false);
    return;
  }
  const i = motivo.indexOf(":");
  const origen = motivo.slice(0, i);
  const rutas = motivo.slice(i + 1).split(",").filter(Boolean);
  if (origen === "estado" || rutas.every((r) => SILENCIOSAS.has(r))) {
    if (app.fase === "lista") pintarCabecera();
    return;
  }
  // Lo que acabas de hacer tú se ve al momento (y ya está guardado).
  if (origen === "local") {
    ocupada = false;
    pintar(true);
    return;
  }
  // Lo que llega de fuera no pisa lo que estás escribiendo.
  if (ocupada) {
    pendiente = true;
    pintarCabecera();
    return;
  }
  pintar(true);
});
window.addEventListener("hashchange", () => {
  pendiente = false;
  ocupada = false;
  bloquearRedibujo(null);
  if (app.fase === "lista") {
    pintar();
    window.scrollTo(0, 0);
  }
});
document.addEventListener("focusout", () => setTimeout(() => { if (pendiente && !ocupada) pintar(true); }, 0));
document.addEventListener("close", () => setTimeout(() => { if (pendiente && !ocupada) pintar(true); }, 0), true);

// Sincronizar: al abrir, al volver a la app, al recuperar la red y cada minuto con la app a la vista
// (lo que haces tú se sube enseguida; esto es para ver lo de la otra).
let ultimaVersion = 0;
async function revisarVersion() {
  if (DEV || Date.now() - ultimaVersion < 10 * 60 * 1000) return;
  ultimaVersion = Date.now();
  try {
    const r = await fetch("/version.json", { cache: "no-store" });
    const j = (await r.json()) as { version?: string };
    if (j.version && j.version !== VERSION_APP && !nuevaVersion) {
      nuevaVersion = true;
      pintarAvisos();
    }
  } catch {
    /* sin red */
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") {
    // Al salir de la app: se envía lo pendiente y los avisos que estaban esperando.
    if (app.fase === "lista") void app.sincronizar().then(() => app.avisador?.vaciar());
    return;
  }
  if (app.fase === "lista") void app.sincronizar();
  void revisarVersion();
});
window.addEventListener("online", () => { if (app.fase === "lista") void app.sincronizar(); });
setInterval(() => {
  if (document.visibilityState === "visible" && app.fase === "lista") void app.sincronizar();
}, 60_000);
// Cada minuto: la cabecera (avisos de caducidad, insignias); la pantalla solo si cambia el día.
let diaPintado = hoy();
setInterval(() => {
  if (app.fase !== "lista") return;
  pintarCabecera();
  if (hoy() !== diaPintado) {
    diaPintado = hoy();
    pintar(true);
  }
}, 60_000);

pintar();
void app.arrancar().catch((e: unknown) => {
  principal.replaceChildren(h("div", { class: "tarjeta" },
    h("h2", {}, "No se ha podido abrir Merviri"),
    h("p", {}, e instanceof Error ? e.message : String(e))));
});
void revisarVersion();
// Fiestas locales de Valladolid (datos abiertos de la Junta): como mucho una vez por semana.
const festivos = () => void actualizarFestivosLocales().then((cambio) => { if (cambio) app.refrescar(); }, () => undefined);
festivos();
setInterval(festivos, 6 * 3600 * 1000);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async () => {
    const reg = await navigator.serviceWorker.ready;
    const urls = [location.origin + "/", ...performance.getEntriesByType("resource").map((e) => e.name)];
    reg.active?.postMessage({ type: "cache-urls", urls });
  });
}
