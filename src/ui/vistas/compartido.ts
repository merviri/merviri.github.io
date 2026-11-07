import type { Merviri } from "../../app/app";
import { RUTA_ALBUMES, albumDePlan, type Album } from "../../dominio/album";
import { RUTA_LISTAS, rutaElementos, separarCantidad, type Elemento, type Lista } from "../../dominio/listas";
import { RUTA_NOTAS, type Nota } from "../../dominio/notas";
import { RUTA_PLANES, type Plan } from "../../dominio/planes";
import { nuevoId } from "../../util/bytes";
import { conBoton, h, tostada } from "../dom";
import { subirArchivos } from "./album";
import { editarPlan } from "./planes";

/**
 * Lo que llega con «Compartir → Merviri» en Android (share target). El
 * service worker lo deja en una caché y redirige aquí.
 */
const CACHE = "merviri-compartido";

interface Compartido {
  archivos: File[];
  titulo: string | null;
  texto: string | null;
  url: string | null;
}

async function leer(): Promise<Compartido> {
  const vacio: Compartido = { archivos: [], titulo: null, texto: null, url: null };
  if (!("caches" in window)) return vacio;
  const c = await caches.open(CACHE);
  const meta = await c.match("/compartido/meta");
  if (!meta) return vacio;
  const m = (await meta.json()) as { titulo?: string | null; texto?: string | null; url?: string | null; n?: number };
  const archivos: File[] = [];
  for (let i = 0; i < (m.n ?? 0); i++) {
    const r = await c.match(`/compartido/archivo-${i}`);
    if (!r) continue;
    const nombre = decodeURIComponent(r.headers.get("X-Nombre") ?? `foto-${i}.jpg`);
    archivos.push(new File([await r.blob()], nombre, { type: r.headers.get("Content-Type") ?? "image/jpeg", lastModified: Number(r.headers.get("X-Fecha")) || Date.now() }));
  }
  return { archivos, titulo: m.titulo ?? null, texto: m.texto ?? null, url: m.url ?? null };
}

async function limpiar() {
  if ("caches" in window) await caches.delete(CACHE);
}

/** Primer enlace que aparezca en un texto (las apps a menudo lo mandan dentro del texto). */
const enlaceDe = (t: string | null) => /https?:\/\/\S+/.exec(t ?? "")?.[0] ?? null;

let estado: { cargado: boolean; datos: Compartido | null } = { cargado: false, datos: null };

export function vistaCompartido(app: Merviri): HTMLElement {
  if (!estado.cargado) {
    estado = { cargado: true, datos: null };
    void leer().then((d) => { estado = { cargado: true, datos: d }; app.refrescar(); }, () => { estado = { cargado: true, datos: { archivos: [], titulo: null, texto: null, url: null } }; app.refrescar(); });
    return h("section", {}, h("p", { class: "secundario" }, "Abriendo lo compartido…"));
  }
  const d = estado.datos;
  if (!d) return h("section", {}, h("p", { class: "secundario" }, "Abriendo lo compartido…"));
  const terminar = async (destino: string) => {
    await limpiar();
    estado = { cargado: false, datos: null };
    location.hash = destino;
  };

  if (d.archivos.length) {
    const albumes = app.lista<Album>(RUTA_ALBUMES);
    const planes = app.lista<Plan>(RUTA_PLANES).filter((p) => (p.estado === "planificado" || p.estado === "hecho") && !albumes.some((a) => a.plan === p.id))
      .sort((a, b) => (b.fecha ?? b.hechoEn ?? "").localeCompare(a.fecha ?? a.hechoEn ?? "")).slice(0, 10);
    const sel = h("select", { "aria-label": "Álbum" },
      h("option", { value: "" }, "Solo al álbum (por meses)"),
      albumes.map((a) => h("option", { value: a.id }, `${a.emoji} ${a.nombre}`)),
      planes.map((p) => h("option", { value: albumDePlan(p.id) }, `✨ ${p.titulo}`)));
    const subir = h("button", { type: "button", class: "boton boton-primario" }, `Subir ${d.archivos.length === 1 ? "la foto" : `${d.archivos.length} fotos`}`);
    subir.addEventListener("click", () => void conBoton(subir, async () => {
      const album = sel.value || null;
      const archivos = d.archivos;
      await limpiar();
      estado = { cargado: false, datos: null };
      location.hash = album ? `#album/${album}` : "#album";
      await subirArchivos(app, archivos, album);
    }));
    return h("section", {},
      h("h1", {}, "📷 Fotos compartidas"),
      h("p", {}, `${d.archivos.length === 1 ? "Una foto" : `${d.archivos.length} fotos`} para el álbum de Merviri. Se suben en su calidad original y cifradas.`),
      h("div", { class: "campo" }, h("label", {}, "¿A qué álbum?"), sel),
      h("div", { class: "botones" }, subir, h("button", { type: "button", class: "boton", onclick: () => void terminar("#inicio") }, "Cancelar")),
    );
  }

  const url = d.url ?? enlaceDe(d.texto);
  const textoLimpio = (d.texto ?? "").replace(url ?? "", "").trim();
  const titulo = (d.titulo || textoLimpio.split("\n")[0] || url || "").slice(0, 120);
  if (!titulo && !url) {
    return h("section", {}, h("h1", {}, "Compartir"), h("p", { class: "secundario" }, "No ha llegado nada."),
      h("a", { class: "boton", href: "#inicio", onclick: () => void limpiar() }, "Ir al inicio"));
  }
  const listas = app.lista<Lista>(RUTA_LISTAS);
  const selLista = h("select", { "aria-label": "Lista" }, listas.map((l) => h("option", { value: l.id }, `${l.emoji} ${l.nombre}`)));
  return h("section", {},
    h("h1", {}, "Guardar en Merviri"),
    h("div", { class: "tarjeta" }, h("p", {}, h("b", {}, titulo)), url ? h("p", { class: "secundario pequeno" }, url) : null),
    h("div", { class: "botones-columna" },
      h("button", {
        type: "button", class: "boton boton-primario",
        onclick: async () => { await limpiar(); estado = { cargado: false, datos: null }; await editarPlan(app, null, { titulo, enlace: url, notas: textoLimpio && textoLimpio !== titulo ? textoLimpio : null }); },
      }, "✨ Idea para Planes"),
      h("button", {
        type: "button", class: "boton",
        onclick: async () => {
          const id = nuevoId();
          await app.guardar<Nota>(RUTA_NOTAS, { id, titulo, texto: [textoLimpio !== titulo ? textoLimpio : "", url ?? ""].filter(Boolean).join("\n"), color: "blanco", fijada: false });
          await terminar(`#nota/${id}`);
        },
      }, "🗒️ Como nota"),
    ),
    listas.length ? h("div", { class: "tarjeta arriba" },
      h("div", { class: "campo" }, h("label", {}, "📝 En una lista"), selLista),
      h("button", {
        type: "button", class: "boton arriba",
        onclick: async () => {
          const { texto: t, cantidad } = separarCantidad(titulo);
          await app.guardar<Elemento>(rutaElementos(selLista.value), {
            id: nuevoId(), texto: t, cantidad, nota: url, hecho: false, hechoPor: null, hechoEn: null, orden: -Date.now(),
          });
          tostada("Añadido a la lista ✨");
          await terminar(`#lista/${selLista.value}`);
        },
      }, "Añadir")) : null,
    h("p", { class: "arriba" }, h("button", { type: "button", class: "enlace-boton", onclick: () => void terminar("#inicio") }, "Cancelar")),
  );
}
