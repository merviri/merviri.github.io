import type { Merviri } from "../../app/app";
import {
  contarPuntos,
  COLORES_DIBUJO,
  esParaMi,
  FONDOS_DIBUJO,
  GROSORES,
  ID_TRAZOS,
  idReaccion,
  MAX_PUNTOS,
  RUTA_DIBUJOS,
  RUTA_REACCIONES,
  rutaTrazos,
  sinVer,
  type Destino,
  type Dibujo,
  type Reaccion,
  type TrazosDibujo,
} from "../../dominio/dibujos";
import { haceCuanto } from "../../dominio/fechas";
import { esIdPersona, otraPersona, type IdPersona } from "../../dominio/pareja";
import type { Registro } from "../../sync/motor";
import { nuevoId } from "../../util/bytes";
import { bloquearRedibujo } from "../bloqueo";
import { confirmarPeligro, h, tostada } from "../dom";
import { aPng, aTrazos, crearLienzo, deTrazos, type TrazoVivo } from "../lienzo";
import { volver } from "./comunes";

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

export function dibujos(app: Merviri): Registro<Dibujo>[] {
  return app.lista<Dibujo>(RUTA_DIBUJOS).sort((a, b) => b.actualizado.localeCompare(a.actualizado));
}

const reacciones = (app: Merviri) => app.lista<Reaccion>(RUTA_REACCIONES);

export const dibujosSinVer = (app: Merviri) => sinVer(dibujos(app), reacciones(app), app.persona);

function trazosDe(app: Merviri, id: string): TrazoVivo[] | null {
  const t = app.uno<TrazosDibujo>(rutaTrazos(id), ID_TRAZOS);
  return t ? deTrazos(t.trazos) : null;
}

const reaccion = (app: Merviri, dibujo: string, persona: IdPersona) =>
  app.uno<Reaccion>(RUTA_REACCIONES, idReaccion(dibujo, persona));

async function reaccionar(app: Merviri, dibujo: string, cambios: Partial<Pick<Reaccion, "visto" | "megusta">>) {
  const yo = app.persona;
  const previa = reaccion(app, dibujo, yo);
  const nueva: Reaccion = {
    id: idReaccion(dibujo, yo), dibujo, persona: yo,
    visto: previa?.visto ?? null, megusta: previa?.megusta ?? false, ...cambios,
  };
  if (previa && previa.visto === nueva.visto && previa.megusta === nueva.megusta) return;
  await app.guardar<Reaccion>(RUTA_REACCIONES, nueva);
}

const marcarVisto = (app: Merviri, d: Registro<Dibujo>) =>
  esParaMi(d, app.persona) && !reaccion(app, d.id, app.persona)?.visto
    ? reaccionar(app, d.id, { visto: new Date().toISOString() })
    : Promise.resolve();

async function guardarImagen(d: Dibujo, trazos: TrazoVivo[]) {
  const blob = await aPng(d.fondo, trazos);
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: `merviri-dibujo-${d.id.slice(0, 6)}.png` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  tostada("Imagen guardada en Descargas. Desde la galería puedes ponerla de fondo.");
}

function quienPara(app: Merviri, d: Registro<Dibujo>): string {
  const pareja = app.pareja();
  const de = esIdPersona(d.por) ? pareja.personas[d.por].nombre : "";
  const para = d.para === "ambas" ? "las dos" : pareja.personas[d.para].nombre;
  return `De ${de} para ${para}`;
}

// ---------------------------------------------------------------------------
// Muro
// ---------------------------------------------------------------------------

export function vistaDibujos(app: Merviri): HTMLElement {
  const lista = dibujos(app);
  const nuevos = new Set(dibujosSinVer(app).map((d) => d.id));
  const otra = otraPersona(app.persona);
  return h("section", {},
    h("div", { class: "cabecera-vista" },
      h("h1", {}, "Dibujos"),
      h("a", { class: "boton boton-primario", href: "#dibujar" }, "🎨 Dibujar"),
    ),
    lista.length
      ? h("div", { class: "muro" }, lista.map((d) => {
        const trazos = trazosDe(app, d.id);
        const lienzo = crearLienzo({ fondo: () => d.fondo, trazos: () => trazos ?? [], etiqueta: quienPara(app, d), clase: "miniatura" });
        const leGusta = d.por === app.persona
          ? (d.para === "ambas" || d.para === otra) && reaccion(app, d.id, otra)?.megusta
          : reaccion(app, d.id, app.persona)?.megusta;
        return h("a", { class: "pieza", href: `#dibujo/${d.id}` },
          lienzo.el,
          nuevos.has(d.id) ? h("span", { class: "pastilla pastilla-rosa nuevo" }, "Nuevo") : null,
          h("small", {}, leGusta ? "❤️ " : "", `${quienPara(app, d)} · ${haceCuanto(d.actualizado)}`));
      }))
      : h("div", { class: "tarjeta tarjeta-rosa" },
        h("p", {}, h("b", {}, "Haz un dibujito para la otra ✨")),
        h("p", {}, "Le aparecerá en grande la próxima vez que abra Merviri. Podéis guardarlos como imagen para ponerlos de fondo de pantalla."),
        h("a", { class: "boton", href: "#dibujar" }, "Dibujar")),
  );
}

// ---------------------------------------------------------------------------
// Dibujar
// ---------------------------------------------------------------------------

interface Borrador {
  trazos: TrazoVivo[];
  deshechos: TrazoVivo[];
  fondo: string;
  color: string;
  grosor: number;
  para: Destino | null;
  respondeA: string | null;
}

let borrador: Borrador | null = null;

export function vistaDibujar(app: Merviri, respondeA?: string): HTMLElement {
  const otra = otraPersona(app.persona);
  const pareja = app.pareja();
  if (!borrador || (respondeA && borrador.respondeA !== respondeA && !borrador.trazos.length)) {
    borrador = {
      trazos: [], deshechos: [], fondo: FONDOS_DIBUJO[0]!, color: COLORES_DIBUJO[1]!, grosor: GROSORES[1]!,
      para: null, respondeA: respondeA ?? null,
    };
  }
  const b = borrador;
  // Mientras se dibuja, la sincronización no redibuja esta pantalla.
  bloquearRedibujo(() => true);

  const lienzo = crearLienzo({
    fondo: () => b.fondo,
    trazos: () => b.trazos,
    pincel: () => ({ color: b.color, grosor: b.grosor }),
    alDibujar: (t) => {
      if (contarPuntos(aTrazos([...b.trazos, t])) > MAX_PUNTOS) {
        tostada("El dibujo ya es muy grande: envíalo o borra algo.", "error");
        return;
      }
      b.trazos.push(t);
      b.deshechos = [];
      actualizarBotones();
    },
    etiqueta: "Lienzo para dibujar",
  });

  const muestra = (valor: string, actual: () => string, fijar: (v: string) => void, clase: string, etiqueta: string) => {
    const boton = h("button", { type: "button", class: clase, "aria-label": etiqueta, title: etiqueta, "aria-pressed": String(actual() === valor) });
    boton.style.setProperty("--muestra", valor);
    boton.addEventListener("click", () => {
      fijar(valor);
      boton.parentElement!.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === boton)));
      lienzo.repintar();
    });
    return boton;
  };

  const colores = h("div", { class: "paleta", "aria-label": "Colores" },
    COLORES_DIBUJO.map((c, i) => muestra(c, () => b.color, (v) => { b.color = v; }, "color", `Color ${i + 1}`)));
  const grosores = h("div", { class: "paleta", "aria-label": "Grosor" },
    GROSORES.map((g, i) => {
      const boton = h("button", { type: "button", class: "grosor", "aria-pressed": String(b.grosor === g), "aria-label": ["Fino", "Medio", "Gordo"][i]! },
        h("span", {}));
      boton.style.setProperty("--g", `${4 + i * 6}px`);
      boton.addEventListener("click", () => {
        b.grosor = g;
        grosores.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === boton)));
      });
      return boton;
    }));
  const fondos = h("div", { class: "paleta", "aria-label": "Fondo" },
    FONDOS_DIBUJO.map((f, i) => muestra(f, () => b.fondo, (v) => { b.fondo = v; }, "color fondo", `Fondo ${i + 1}`)));

  const deshacer = h("button", { type: "button", class: "boton" }, "↶ Deshacer");
  const rehacer = h("button", { type: "button", class: "boton" }, "↷");
  const borrarTodo = h("button", { type: "button", class: "boton" }, "Borrar todo");
  const actualizarBotones = () => {
    deshacer.disabled = !b.trazos.length;
    rehacer.disabled = !b.deshechos.length;
    borrarTodo.disabled = !b.trazos.length;
  };
  deshacer.addEventListener("click", () => {
    const t = b.trazos.pop();
    if (t) b.deshechos.push(t);
    lienzo.repintar();
    actualizarBotones();
  });
  rehacer.addEventListener("click", () => {
    const t = b.deshechos.pop();
    if (t) b.trazos.push(t);
    lienzo.repintar();
    actualizarBotones();
  });
  borrarTodo.addEventListener("click", async () => {
    if (!(await confirmarPeligro("Borrar el dibujo", "Se borra todo lo que has dibujado.", "Borrar"))) return;
    b.trazos = [];
    b.deshechos = [];
    lienzo.repintar();
    actualizarBotones();
  });
  actualizarBotones();

  const para = h("select", { "aria-label": "Para quién" },
    h("option", { value: otra, selected: (b.para ?? otra) === otra }, `Para ${pareja.personas[otra].nombre}`),
    h("option", { value: "ambas", selected: b.para === "ambas" }, "Para las dos (mural)"));
  para.addEventListener("change", () => { b.para = para.value as Destino; });

  const enviar = h("button", { type: "button", class: "boton boton-primario" }, "Enviar ✨");
  enviar.addEventListener("click", async () => {
    if (!b.trazos.length) {
      tostada("Dibuja algo primero 🙂");
      return;
    }
    enviar.disabled = true;
    try {
      const id = nuevoId();
      await app.guardar<TrazosDibujo>(rutaTrazos(id), { id: ID_TRAZOS, trazos: aTrazos(b.trazos) });
      await app.guardar<Dibujo>(RUTA_DIBUJOS, { id, para: (para.value as Destino) ?? otra, fondo: b.fondo, respondeA: b.respondeA });
      borrador = null;
      bloquearRedibujo(null);
      location.hash = "#dibujos";
      tostada(para.value === "ambas" ? "¡Al mural! ✨" : `Enviado. ${pareja.personas[otra].nombre} lo verá al abrir Merviri ✨`);
    } finally {
      enviar.disabled = false;
    }
  });

  return h("section", { class: "pantalla-dibujo" },
    volver("#dibujos", "Dibujos"),
    b.respondeA ? h("p", { class: "secundario" }, "Respondiendo a un dibujo ✨") : null,
    h("div", { class: "herramientas" }, colores, grosores),
    lienzo.el,
    h("div", { class: "herramientas" }, deshacer, rehacer, borrarTodo),
    h("details", { class: "hechos" }, h("summary", {}, "Color de fondo"), fondos),
    h("div", { class: "botones" }, para, enviar),
  );
}

// ---------------------------------------------------------------------------
// Ver un dibujo
// ---------------------------------------------------------------------------

function accionesDibujo(app: Merviri, d: Registro<Dibujo>, trazos: TrazoVivo[] | null, cerrar?: () => void): HTMLElement {
  const mio = d.por === app.persona;
  const gusta = reaccion(app, d.id, app.persona)?.megusta ?? false;
  const corazon = h("button", { type: "button", class: "boton", "aria-pressed": String(gusta) }, gusta ? "❤️ Te gusta" : "🤍 Me gusta");
  corazon.addEventListener("click", async () => {
    const nuevo = !(reaccion(app, d.id, app.persona)?.megusta ?? false);
    await reaccionar(app, d.id, { megusta: nuevo, visto: reaccion(app, d.id, app.persona)?.visto ?? new Date().toISOString() });
    corazon.textContent = nuevo ? "❤️ Te gusta" : "🤍 Me gusta";
    corazon.setAttribute("aria-pressed", String(nuevo));
  });
  return h("div", { class: "botones" },
    mio ? null : corazon,
    trazos ? h("button", { type: "button", class: "boton", onclick: () => void guardarImagen(d, trazos) }, "Guardar imagen") : null,
    mio ? null : h("a", { class: "boton boton-primario", href: `#dibujar/${d.id}`, onclick: () => cerrar?.() }, "Responder"),
  );
}

export function vistaDibujo(app: Merviri, id: string): HTMLElement {
  const lista = app.lista<Dibujo>(RUTA_DIBUJOS);
  const d = lista.find((x) => x.id === id);
  if (!d) return h("section", {}, volver("#dibujos", "Dibujos"), h("p", {}, "Este dibujo ya no existe."));
  const trazos = trazosDe(app, id);
  void marcarVisto(app, d);
  const otra = otraPersona(app.persona);
  const vistoPorOtra = d.por === app.persona ? reaccion(app, d.id, otra) : null;
  const lienzo = crearLienzo({ fondo: () => d.fondo, trazos: () => trazos ?? [], etiqueta: quienPara(app, d) });
  return h("section", { class: "pantalla-dibujo" },
    volver("#dibujos", "Dibujos"),
    h("p", { class: "secundario" }, `${quienPara(app, d)} · ${haceCuanto(d.actualizado)}`,
      vistoPorOtra?.visto ? ` · lo vio ${haceCuanto(vistoPorOtra.visto)}` : "",
      vistoPorOtra?.megusta ? " · ❤️" : ""),
    trazos ? lienzo.el : h("p", { class: "secundario" }, "Cargando el dibujo…"),
    accionesDibujo(app, d, trazos),
    h("button", {
      type: "button", class: "enlace-boton peligro arriba",
      onclick: async () => {
        if (!(await confirmarPeligro("Borrar el dibujo", "Se borra para las dos.", "Borrar"))) return;
        await app.borrar(RUTA_DIBUJOS, d.id);
        await app.borrar(rutaTrazos(d.id), ID_TRAZOS);
        location.hash = "#dibujos";
      },
    }, "Borrar el dibujo"),
  );
}

// ---------------------------------------------------------------------------
// Aviso al abrir la app: «María te ha dejado un dibujo»
// ---------------------------------------------------------------------------

const mostradosEnEstaSesion = new Set<string>();

export function avisarDibujoNuevo(app: Merviri) {
  if (document.querySelector("dialog[open]")) return;
  const d = dibujosSinVer(app).find((x) => !mostradosEnEstaSesion.has(x.id));
  if (!d) return;
  const trazos = trazosDe(app, d.id);
  if (!trazos) return; // aún no han llegado los trazos: se mostrará en la siguiente sincronización
  mostradosEnEstaSesion.add(d.id);
  const pareja = app.pareja();
  const de = esIdPersona(d.por) ? pareja.personas[d.por].nombre : "La otra";
  const lienzo = crearLienzo({ fondo: () => d.fondo, trazos: () => trazos, etiqueta: `Dibujo de ${de}`, clase: "en-dialogo" });
  const dlg = h("dialog", { class: "dialogo dialogo-dibujo", "aria-labelledby": "dlg-dibujo" });
  const cerrar = () => dlg.close();
  dlg.append(
    h("h2", { id: "dlg-dibujo" }, `${de} te ha dejado un dibujo ✨`),
    lienzo.el,
    accionesDibujo(app, d, trazos, cerrar),
    h("div", { class: "dialogo-acciones" }, h("button", { type: "button", class: "boton", onclick: cerrar }, "Cerrar")),
  );
  dlg.addEventListener("close", () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
  void marcarVisto(app, d);
}
