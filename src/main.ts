import "@fontsource-variable/nunito";
import "./ui/estilos.css";
import { Merviri, VERSION_APP, type CrearRemoto } from "./app/app";
import { codigoDeHash } from "./cifrado/vinculo";
import { ClienteGitHub } from "./github/cliente";
import { AlmacenIdb } from "./local/almacen";
import { dialogo, h, icono, tostada } from "./ui/dom";
import { vistaAjustes } from "./ui/vistas/ajustes";
import { vistaBienvenida } from "./ui/vistas/bienvenida";
import { vistaInicio } from "./ui/vistas/inicio";
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

// El código de un enlace de vinculación se guarda en memoria y se quita de la barra de direcciones.
let codigoVinculo = codigoDeHash(location.hash);
if (codigoVinculo) history.replaceState(null, "", `${location.pathname}${location.search}#inicio`);

type Ruta = "inicio" | "ajustes" | "vincular-otro" | "token";
const VISTAS: Record<Ruta, (a: Merviri) => HTMLElement> = {
  inicio: vistaInicio,
  ajustes: vistaAjustes,
  "vincular-otro": vistaVincularOtro,
  token: vistaToken,
};
const ruta = (): Ruta => {
  const r = location.hash.slice(1) as Ruta;
  return r in VISTAS ? r : "inicio";
};

const principal = document.getElementById("principal")!;
const estado = document.getElementById("estado")!;
const avisos = document.getElementById("avisos")!;
const irAjustes = document.getElementById("ir-ajustes")!;
irAjustes.replaceChildren(icono("ajustes"));

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

function pintar(deFondo = false) {
  pintarEstado();
  pintarAvisos();
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
  // Lo que llega de fondo no redibuja mientras se escribe o hay un diálogo abierto.
  if (deFondo && faseMontada === "lista") {
    const activo = document.activeElement;
    const escribiendo = activo && principal.contains(activo) && ["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName);
    if (escribiendo || document.querySelector("dialog[open]")) {
      pendiente = true;
      return;
    }
  }
  pendiente = false;
  faseMontada = "lista";
  principal.replaceChildren(VISTAS[ruta()](app));
}

app.alCambiar((motivo) => pintar(motivo !== "fase" && motivo !== "manual"));
window.addEventListener("hashchange", () => {
  pendiente = false;
  if (app.fase === "lista") {
    pintar();
    window.scrollTo(0, 0);
  }
});
document.addEventListener("focusout", () => setTimeout(() => { if (pendiente) pintar(true); }, 0));
document.addEventListener("close", () => setTimeout(() => { if (pendiente) pintar(true); }, 0), true);

// Sincronizar: al abrir, al volver a la app, al recuperar la red y cada 20 s con la app a la vista.
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
  if (document.visibilityState !== "visible") return;
  if (app.fase === "lista") void app.sincronizar();
  void revisarVersion();
});
window.addEventListener("online", () => { if (app.fase === "lista") void app.sincronizar(); });
setInterval(() => {
  if (document.visibilityState === "visible" && app.fase === "lista") void app.sincronizar();
}, 20_000);
// El reloj de «hace X min» y los avisos de fecha se refrescan cada minuto.
setInterval(() => { if (app.fase === "lista") pintar(true); }, 60_000);

pintar();
void app.arrancar().catch((e: unknown) => {
  principal.replaceChildren(h("div", { class: "tarjeta" },
    h("h2", {}, "No se ha podido abrir Merviri"),
    h("p", {}, e instanceof Error ? e.message : String(e))));
});
void revisarVersion();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async () => {
    const reg = await navigator.serviceWorker.ready;
    const urls = [location.origin + "/", ...performance.getEntriesByType("resource").map((e) => e.name)];
    reg.active?.postMessage({ type: "cache-urls", urls });
  });
}
