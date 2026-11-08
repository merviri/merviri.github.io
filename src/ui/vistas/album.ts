import type { Merviri } from "../../app/app";
import {
  albumDePlan,
  deAlbum,
  DIAS_PAPELERA,
  diasEnPapelera,
  formatoBytes,
  LIMITE_REPO,
  ordenar,
  porMes,
  REPOS_FOTOS,
  RUTA_ALBUMES,
  rutaFotos,
  usoPorRepo,
  type Album,
  type Foto,
} from "../../dominio/album";
import { esIdPersona } from "../../dominio/pareja";
import { RUTA_PLANES, type Plan } from "../../dominio/planes";
import { hoy } from "../../dominio/fechas";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { campo, conBoton, confirmarPeligro, dialogoFormulario, h, tostada } from "../dom";
import { texto, volver } from "./comunes";
import { diaLargo } from "./evento";

type Pestana = "fotos" | "albumes" | "papelera";
let pestana: Pestana = "fotos";
/** Fotos de la última cuadrícula pintada (para pasar a la anterior/siguiente en el visor). */
let contexto: string[] = [];
let volverA = "#album";

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
const nombreMes = (m: string) => MES.format(new Date(`${m}-15T12:00:00Z`));

function sinServicio(): HTMLElement {
  return h("section", {}, h("h1", {}, "Álbum"), h("p", { class: "secundario" }, "El álbum no está disponible en este dispositivo."));
}

// ---------------------------------------------------------------------------
// Miniaturas (se cargan al verse)
// ---------------------------------------------------------------------------

const observador = typeof IntersectionObserver !== "undefined"
  ? new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observador!.unobserve(e.target);
      (e.target as HTMLElement & { cargar?: () => void }).cargar?.();
    }
  }, { rootMargin: "300px" })
  : null;

function miniatura(app: Merviri, f: Foto, ids: string[]): HTMLElement {
  const img = h("img", { alt: `Foto del ${diaLargo(f.fecha)}`, loading: "lazy", decoding: "async" });
  const caja = h("a", { class: "miniatura", href: `#foto/${f.id}`, onclick: () => { contexto = ids; volverA = location.hash || "#album"; } },
    img, f.favorita ? h("span", { class: "marca-favorita", "aria-label": "Favorita" }, "❤️") : null) as HTMLElement & { cargar?: () => void };
  caja.cargar = () => {
    app.album!.url(f, "mini").then((u) => { img.src = u; }, () => { caja.classList.add("rota"); img.alt = "No se pudo cargar"; });
  };
  if (observador) observador.observe(caja);
  else caja.cargar();
  return caja;
}

function cuadricula(app: Merviri, fotos: Foto[]): HTMLElement {
  const ids = fotos.map((f) => f.id);
  return h("div", { class: "cuadricula-fotos" }, fotos.map((f) => miniatura(app, f, ids)));
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

export function asegurarAlbumDePlan(app: Merviri, albumId: string): Promise<void> | void {
  if (!albumId.startsWith("plan-") || app.uno<Album>(RUTA_ALBUMES, albumId)) return;
  const plan = app.uno<Plan>(RUTA_PLANES, albumId.slice(5));
  if (!plan) return;
  return app.guardar<Album>(RUTA_ALBUMES, { id: albumId, nombre: plan.titulo, emoji: "✨", plan: plan.id }).then(() => undefined);
}

export async function subirArchivos(app: Merviri, archivos: File[], album: string | null) {
  if (!archivos.length || !app.album) return;
  if (album) await asegurarAlbumDePlan(app, album);
  const n = await app.album.subir(archivos, album, () => app.refrescar());
  const fallos = app.album.progreso?.fallos ?? [];
  if (fallos.length) tostada(`Subidas ${n}; ${fallos.length} no se pudieron subir.`, "error");
  else tostada(n === 1 ? "Foto subida ✨" : `${n} fotos subidas ✨`);
}

function botonSubir(app: Merviri, album: string | null, textoBoton = "＋ Subir fotos"): HTMLElement {
  const input = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true });
  input.addEventListener("change", () => {
    const archivos = [...(input.files ?? [])];
    input.value = "";
    void subirArchivos(app, archivos, album);
  });
  const b = h("button", { type: "button", class: "boton boton-primario", onclick: () => input.click() }, textoBoton);
  return h("span", {}, b, input);
}

function tarjetaProgreso(app: Merviri): HTMLElement | null {
  const p = app.album?.progreso;
  if (!p || (!p.activa && !p.fallos.length)) return null;
  const barra = h("span", { class: "barra" });
  barra.style.width = `${Math.round((p.hechas / Math.max(1, p.total)) * 100)}%`;
  return h("div", { class: "tarjeta tarjeta-rosa" },
    h("p", {}, h("b", {}, p.activa ? `Subiendo fotos: ${p.hechas} de ${p.total}…` : `Subida terminada: ${p.hechas - p.fallos.length} de ${p.total}`)),
    h("span", { class: "pista" }, barra),
    p.activa ? h("p", { class: "pequeno arriba" }, "Deja Merviri abierta hasta que termine (cada foto se cifra antes de subirla).") : null,
    p.fallos.length ? h("details", { class: "arriba" }, h("summary", {}, `${p.fallos.length} con problemas`), h("ul", {}, p.fallos.map((x) => h("li", { class: "pequeno" }, x)))) : null,
    p.activa ? h("button", { type: "button", class: "boton boton-pequeno arriba", onclick: () => { app.album!.cancelar = true; } }, "Parar") : null,
  );
}

async function descargarZip(app: Merviri, fotos: Foto[], nombre: string, boton: HTMLButtonElement) {
  if (!fotos.length) return;
  const original = boton.textContent;
  boton.disabled = true;
  try {
    const blob = await app.album!.zip(fotos, nombre, (n) => { boton.textContent = `Preparando ${n}/${fotos.length}…`; });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `${nombre}.zip` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    tostada((e as Error).message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = original;
  }
}

const botonZip = (app: Merviri, fotos: Foto[], nombre: string) => {
  const b = h("button", { type: "button", class: "boton boton-pequeno", title: "Descargar los originales en un ZIP" }, "⬇️ ZIP");
  b.addEventListener("click", () => void descargarZip(app, fotos, nombre, b));
  return b;
};

// ---------------------------------------------------------------------------
// Pantalla principal
// ---------------------------------------------------------------------------

export function vistaAlbum(app: Merviri, param = ""): HTMLElement {
  if (!app.album) return sinServicio();
  if (param) return vistaUnAlbum(app, param);
  const fotos = app.album.fotos();
  const papelera = ordenar(fotos.filter((f) => f.papelera));
  const tab = (p: Pestana, t: string) => h("button", { type: "button", role: "tab", "aria-selected": String(pestana === p), onclick: () => { pestana = p; app.refrescar(); } }, t);
  const uso = usoPorRepo(fotos);
  const total = [...uso.values()].reduce((a, b) => a + b, 0);

  return h("section", {},
    h("div", { class: "cabecera-vista" }, h("h1", {}, "Álbum"), botonSubir(app, null)),
    tarjetaProgreso(app),
    h("div", { class: "segmentado" }, tab("fotos", "Fotos"), tab("albumes", "Álbumes"), tab("papelera", `Papelera${papelera.length ? ` (${papelera.length})` : ""}`)),
    pestana === "fotos" ? pestanaFotos(app, fotos) : pestana === "albumes" ? pestanaAlbumes(app, fotos) : pestanaPapelera(app, papelera),
    h("p", { class: "secundario pequeno arriba-mas" },
      `Ocupado: ${formatoBytes(total)} de ${formatoBytes(LIMITE_REPO * REPOS_FOTOS.length)}. Las fotos van cifradas: solo vosotras podéis verlas.`),
    ayudaCompartir(),
  );
}

let ayudaAbierta = false;

/** Por qué puede no salir «Merviri» al compartir desde la galería (Android). */
function ayudaCompartir(): HTMLElement {
  const instalada = matchMedia("(display-mode: standalone)").matches;
  return h("details", { class: "hechos arriba", open: ayudaAbierta, ontoggle: (ev: Event) => { ayudaAbierta = (ev.currentTarget as HTMLDetailsElement).open; } },
    h("summary", {}, "¿No sale Merviri al compartir desde la galería?"),
    h("ol", { class: "pequeno" },
      instalada ? null : h("li", {}, h("b", {}, "Ahora la estás usando en el navegador. "), "Para que salga en «Compartir» hay que instalarla: en Chrome, ⋮ → «Instalar aplicación», y abrirla desde su icono."),
      h("li", {}, "Si ya la teníais instalada de antes, Android tarda en enterarse de la novedad (Chrome lo revisa como mucho una vez al día al abrirla). Ábrela desde su icono, ciérrala y prueba un rato después."),
      h("li", {}, "Si al día siguiente sigue sin salir: quita el icono de Merviri y vuelve a instalarla desde Chrome. Antes, ten otro dispositivo vinculado, por si al reinstalar te pidiera volver a vincular este con el QR."),
      h("li", {}, "En la hoja de «Compartir», Merviri puede estar al final de la lista: desliza o toca «Más».")),
  );
}

function pestanaFotos(app: Merviri, fotos: Foto[]): HTMLElement {
  const meses = porMes(fotos);
  if (!meses.length) {
    return h("div", { class: "tarjeta" },
      h("p", {}, h("b", {}, "Vuestro álbum, a calidad original ✨")),
      h("p", {}, "Subid fotos desde aquí o, en Android, desde la galería con «Compartir → Merviri». Se ordenan solas por meses."));
  }
  return h("div", {}, meses.map(([m, lista]) => h("section", { class: "mes-fotos" },
    h("div", { class: "cabecera-vista" }, h("h2", {}, `${nombreMes(m)} · ${lista.length}`), botonZip(app, lista, `Merviri ${m}`)),
    cuadricula(app, lista))));
}

function pestanaAlbumes(app: Merviri, fotos: Foto[]): HTMLElement {
  const albumes = app.album!.albumes();
  return h("div", {},
    h("div", { class: "botones" }, h("button", { type: "button", class: "boton", onclick: () => void editarAlbum(app, null) }, "＋ Álbum")),
    albumes.length
      ? h("ul", { class: "tarjetas-lista arriba" }, albumes.map((a) => {
        const de = deAlbum(fotos, a.id);
        return h("li", {}, h("a", { class: "tarjeta-enlace", href: `#album/${a.id}` },
          h("span", { class: "emoji-grande", "aria-hidden": "true" }, a.emoji),
          h("span", { class: "crece" }, h("b", {}, a.nombre), h("small", { class: "secundario" }, `${de.length} foto${de.length === 1 ? "" : "s"}${a.plan ? " · de un plan" : ""}`)),
          h("span", { class: "flecha", "aria-hidden": "true" }, "›")));
      }))
      : h("p", { class: "secundario arriba" }, "Haced álbumes para viajes o momentos especiales. Los planes hechos tienen su álbum (botón 📷 en el plan)."),
  );
}

function pestanaPapelera(app: Merviri, papelera: Foto[]): HTMLElement {
  const bytes = papelera.reduce((n, f) => n + f.bytes, 0);
  const vaciar = h("button", { type: "button", class: "boton boton-peligro" }, `Vaciar y liberar ${formatoBytes(bytes)}`);
  vaciar.addEventListener("click", async () => {
    if (!(await confirmarPeligro("Vaciar la papelera",
      `Se borran para siempre ${papelera.length} foto(s), también de GitHub. No se puede deshacer. No subáis fotos mientras tanto.`, "Vaciar"))) return;
    await conBoton(vaciar, async () => {
      const liberado = await app.album!.vaciarPapelera();
      tostada(`Papelera vaciada: ${formatoBytes(liberado)} liberados ✨`);
      app.refrescar();
    });
  });
  const antiguas = papelera.filter((f) => diasEnPapelera(f, new Date()) >= DIAS_PAPELERA).length;
  return h("div", {},
    h("p", { class: "secundario" }, "Lo que está aquí no se ve en el álbum, pero sigue ocupando espacio hasta que vaciéis la papelera."),
    antiguas ? h("p", { class: "aviso-reserva" }, `${antiguas} foto(s) llevan más de ${DIAS_PAPELERA} días aquí.`) : null,
    papelera.length ? cuadricula(app, papelera) : h("p", { class: "secundario" }, "La papelera está vacía."),
    papelera.length ? h("div", { class: "botones arriba" },
      h("button", { type: "button", class: "boton", onclick: async () => { for (const f of papelera) await app.album!.recuperar(f); tostada("Recuperadas"); } }, "Recuperar todas"),
      vaciar) : null,
  );
}

// ---------------------------------------------------------------------------
// Un álbum
// ---------------------------------------------------------------------------

function vistaUnAlbum(app: Merviri, id: string): HTMLElement {
  const a = app.uno<Album>(RUTA_ALBUMES, id);
  const plan = id.startsWith("plan-") ? app.uno<Plan>(RUTA_PLANES, id.slice(5)) : undefined;
  const nombre = a?.nombre ?? plan?.titulo;
  if (!nombre) return h("section", {}, volver("#album", "Álbum"), h("p", {}, "Este álbum ya no existe."));
  const fotos = deAlbum(app.album!.fotos(), id);
  return h("section", {},
    volver("#album", "Álbum"),
    h("div", { class: "cabecera-vista" },
      h("h1", {}, `${a?.emoji ?? "✨"} ${nombre}`),
      a ? h("button", { type: "button", class: "boton boton-pequeno", onclick: () => void editarAlbum(app, a) }, "Editar") : null),
    plan ? h("p", {}, h("a", { href: `#plan/${plan.id}` }, "Ver el plan ›")) : null,
    tarjetaProgreso(app),
    h("div", { class: "botones" }, botonSubir(app, id, "＋ Subir aquí"), fotos.length ? botonZip(app, fotos, nombre) : null),
    fotos.length ? h("div", { class: "arriba" }, cuadricula(app, fotos)) : h("p", { class: "secundario arriba" }, "Todavía no hay fotos en este álbum."),
  );
}

async function editarAlbum(app: Merviri, a: Registro<Album> | null) {
  let borrar = false;
  let creado = "";
  await dialogoFormulario(a ? "Editar álbum" : "Nuevo álbum", [
    campo("Nombre", h("input", { name: "nombre", value: a?.nombre ?? "", required: true, maxlength: 60, placeholder: "Escapada a Lisboa" })),
    campo("Icono", h("input", { name: "emoji", value: a?.emoji ?? "📷", maxlength: 4 })),
    a ? h("button", { type: "button", class: "enlace-boton peligro", onclick: (ev: Event) => { borrar = true; (ev.target as HTMLElement).closest("form")!.requestSubmit(); } }, "Borrar el álbum (las fotos se quedan)") : null,
  ], a ? "Guardar" : "Crear", async (d) => {
    if (a && borrar) {
      for (const f of app.album!.fotos().filter((x) => x.albumes.includes(a.id))) await app.album!.enAlbum(f, a.id, false);
      await app.borrar(RUTA_ALBUMES, a.id);
      location.hash = "#album";
      return;
    }
    const nombre = texto(d, "nombre").trim();
    if (!nombre) throw new Error("Ponle un nombre.");
    const nuevo: Album = { id: a?.id ?? nuevoId(), nombre, emoji: texto(d, "emoji").trim() || "📷", plan: a?.plan ?? null };
    await app.guardar<Album>(RUTA_ALBUMES, nuevo);
    if (!a) creado = nuevo.id;
  });
  if (creado) location.hash = `#album/${creado}`;
}

// ---------------------------------------------------------------------------
// Visor
// ---------------------------------------------------------------------------

export function vistaFoto(app: Merviri, id: string): HTMLElement {
  if (!app.album) return sinServicio();
  const todas = app.album.fotos();
  const f = todas.find((x) => x.id === id);
  if (!f) return h("section", {}, volver("#album", "Álbum"), h("p", {}, "Esta foto ya no existe."));
  const pareja = app.pareja();
  const i = contexto.indexOf(id);
  const anterior = i > 0 ? contexto[i - 1] : null;
  const siguiente = i >= 0 && i < contexto.length - 1 ? contexto[i + 1] : null;
  const img = h("img", { class: "foto-grande", alt: `Foto del ${diaLargo(f.fecha)}` });
  const estado = h("p", { class: "secundario centro" }, "Cargando…");
  app.album.url(f, "vista").then((u) => { img.src = u; estado.remove(); }, (e: Error) => { estado.textContent = `No se pudo cargar: ${e.message}`; });
  const albumes = app.album.albumes().filter((a) => f.albumes.includes(a.id));
  const autor = esIdPersona(f.por) ? pareja.personas[f.por].nombre : null;

  const descargar = h("button", { type: "button", class: "boton" }, "⬇️ Original");
  descargar.addEventListener("click", () => void conBoton(descargar, async () => {
    const blob = await app.album!.original(f);
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: f.nombre || `merviri-${f.fecha}.jpg` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }));

  return h("section", { class: "visor" },
    volver(volverA, "Volver"),
    h("div", { class: "marco-foto" },
      anterior ? h("a", { class: "flecha-foto izq", href: `#foto/${anterior}`, "aria-label": "Anterior" }, "‹") : null,
      img,
      siguiente ? h("a", { class: "flecha-foto der", href: `#foto/${siguiente}`, "aria-label": "Siguiente" }, "›") : null),
    estado,
    h("p", { class: "centro" }, `${diaLargo(f.fecha)}${f.hora ? `, ${f.hora}` : ""}`,
      autor ? h("small", { class: "secundario" }, ` · subida por ${autor}`) : null),
    albumes.length ? h("p", { class: "centro" }, albumes.map((a) => h("a", { class: "pastilla pastilla-morado", href: `#album/${a.id}` }, `${a.emoji} ${a.nombre}`))) : null,
    f.papelera ? h("p", { class: "aviso-reserva" }, "Está en la papelera.") : null,
    h("div", { class: "botones centrados" },
      h("button", { type: "button", class: "boton", "aria-pressed": String(f.favorita), onclick: () => void app.album!.favorita(f) }, f.favorita ? "❤️ Favorita" : "🤍 Favorita"),
      h("button", { type: "button", class: "boton", onclick: () => void elegirAlbumes(app, f) }, "📁 Álbumes"),
      descargar,
      f.papelera
        ? h("button", { type: "button", class: "boton", onclick: () => void app.album!.recuperar(f) }, "Recuperar")
        : h("button", {
          type: "button", class: "boton boton-peligro",
          onclick: async () => {
            await app.album!.aPapelera(f);
            tostada("A la papelera", "info", { texto: "Deshacer", hacer: () => void app.album!.recuperar(f) });
            location.hash = siguiente ? `#foto/${siguiente}` : volverA;
          },
        }, "🗑️ Papelera")),
  );
}

async function elegirAlbumes(app: Merviri, f: Foto) {
  const albumes = app.album!.albumes();
  const planes = app.lista<Plan>(RUTA_PLANES).filter((p) => p.estado !== "idea" && p.estado !== "descartado" && !albumes.some((a) => a.plan === p.id));
  await dialogoFormulario("Álbumes de esta foto", [
    albumes.length ? h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Álbumes"),
      albumes.map((a) => h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "album", value: a.id, checked: f.albumes.includes(a.id) }), h("span", {}, `${a.emoji} ${a.nombre}`)))) : null,
    planes.length ? h("fieldset", { class: "campo grupo" }, h("legend", { class: "grupo-titulo" }, "Planes (se crea su álbum)"),
      planes.map((p) => h("label", { class: "casilla" }, h("input", { type: "checkbox", name: "album", value: albumDePlan(p.id) }), h("span", {}, `✨ ${p.titulo}`)))) : null,
    campo("O un álbum nuevo", h("input", { name: "nuevo", maxlength: 60, placeholder: "Nombre del álbum" })),
  ], "Guardar", async (d) => {
    const elegidos = new Set(d.getAll("album").map(String));
    const nuevo = texto(d, "nuevo").trim();
    if (nuevo) {
      const id = nuevoId();
      await app.guardar<Album>(RUTA_ALBUMES, { id, nombre: nuevo, emoji: "📷", plan: null });
      elegidos.add(id);
    }
    for (const id of elegidos) await asegurarAlbumDePlan(app, id);
    const actual = app.album!.fotos().find((x) => x.id === f.id) ?? f;
    await app.guardar<Foto>(rutaFotos(actual.fecha), { ...actual, albumes: [...elegidos] });
  });
}

/** Para la portada: fotos de un día como hoy en años anteriores. */
export function haceUnAnio(app: Merviri): Foto[] {
  if (!app.album) return [];
  const md = hoy().slice(5);
  const anio = hoy().slice(0, 4);
  return ordenar(app.album.fotos().filter((f) => !f.papelera && f.fecha.slice(5) === md && f.fecha.slice(0, 4) < anio)).slice(0, 6);
}

export function tiraDeFotos(app: Merviri, fotos: Foto[]): HTMLElement {
  return h("div", { class: "tira-fotos" }, fotos.map((f) => miniatura(app, f, fotos.map((x) => x.id))));
}
