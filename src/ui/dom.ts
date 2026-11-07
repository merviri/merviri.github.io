/**
 * Ayudantes para construir la interfaz sin innerHTML: todo el texto se
 * inserta como texto (nunca como HTML), para que ningún dato pueda inyectar
 * código en la página donde están el token y la clave.
 */
export type Hijo = Node | string | number | null | undefined | false | Hijo[];
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...hijos: Hijo[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  anadir(el, hijos);
  return el;
}

export function anadir(el: Node, hijos: Hijo[]) {
  for (const c of hijos) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) anadir(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

const SVG = "http://www.w3.org/2000/svg";

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...hijos: SVGElement[]) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of hijos) el.appendChild(c);
  return el;
}

/** Iconos sencillos dibujados a mano (trazo, heredan el color del texto). */
export function icono(nombre: "ajustes" | "atras" | "copiar" | "compartir" | "ojo" | "recargar"): SVGSVGElement {
  const trazo = { fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const partes: SVGElement[] = {
    ajustes: [
      s("circle", { cx: 12, cy: 12, r: 3, ...trazo }),
      s("circle", { cx: 12, cy: 12, r: 7, ...trazo }),
      s("circle", { cx: 12, cy: 12, r: 9, ...trazo, "stroke-width": 3, "stroke-dasharray": "2.4 2.3", "stroke-linecap": "butt" }),
    ],
    atras: [s("path", { d: "M15 5l-7 7 7 7", ...trazo })],
    copiar: [s("rect", { x: 8, y: 8, width: 12, height: 12, rx: 2, ...trazo }), s("path", { d: "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2", ...trazo })],
    compartir: [s("path", { d: "M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5", ...trazo })],
    ojo: [s("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", ...trazo }), s("circle", { cx: 12, cy: 12, r: 3, ...trazo })],
    recargar: [s("path", { d: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7", ...trazo })],
  }[nombre];
  const el = s("svg", { viewBox: "0 0 24 24", width: 22, height: 22, "aria-hidden": "true", class: "icono" }, ...partes);
  return el;
}

/** Mensaje breve en la parte inferior, con una acción opcional («Deshacer»). */
export function tostada(texto: string, tipo: "info" | "error" = "info", accion?: { texto: string; hacer: () => void }) {
  const host = document.getElementById("tostadas")!;
  const t = h("div", { class: `tostada tostada-${tipo}`, role: tipo === "error" ? "alert" : "status" }, texto,
    accion ? h("button", { type: "button", class: "tostada-accion", onclick: () => { t.remove(); accion.hacer(); } }, accion.texto) : null);
  host.appendChild(t);
  setTimeout(() => t.remove(), tipo === "error" ? 7000 : accion ? 6000 : 3500);
}

/** Diálogo con acciones. Devuelve la acción elegida (o null si se cierra). */
export function dialogo<T extends string>(
  titulo: string,
  cuerpo: Hijo,
  acciones: { texto: string; valor: T; tipo?: "primario" | "peligro" | "normal" }[],
): Promise<T | null> {
  return new Promise((resolve) => {
    const d = h("dialog", { class: "dialogo", "aria-labelledby": "dlg-titulo" },
      h("h2", { id: "dlg-titulo" }, titulo),
      h("div", { class: "dialogo-cuerpo" }, cuerpo),
      h("div", { class: "dialogo-acciones" },
        acciones.map((a) => h("button", {
          type: "button", class: `boton boton-${a.tipo ?? "normal"}`,
          onclick: () => { d.close(); resolve(a.valor); },
        }, a.texto)),
      ),
    );
    d.addEventListener("cancel", () => resolve(null));
    d.addEventListener("close", () => d.remove());
    document.body.appendChild(d);
    d.showModal();
  });
}

export async function confirmarPeligro(titulo: string, texto: string, accion: string): Promise<boolean> {
  return (await dialogo(titulo, h("p", {}, texto), [
    { texto: "Cancelar", valor: "no" },
    { texto: accion, valor: "si", tipo: "peligro" },
  ])) === "si";
}

/**
 * Formulario en un diálogo. `enviar` recibe los datos; si lanza un error se
 * muestra dentro del diálogo y no se cierra. Devuelve true si se completó.
 */
export function dialogoFormulario(
  titulo: string,
  campos: Hijo,
  textoBoton: string,
  enviar: (datos: FormData) => Promise<void>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const error = h("p", { class: "error", role: "alert" });
    const boton = h("button", { type: "submit", class: "boton boton-primario" }, textoBoton);
    const form = h("form", { class: "formulario" }, campos, error,
      h("div", { class: "dialogo-acciones" },
        h("button", { type: "button", class: "boton boton-normal", onclick: () => { d.close(); resolve(false); } }, "Cancelar"),
        boton,
      ),
    );
    const d = h("dialog", { class: "dialogo", "aria-labelledby": "dlg-titulo" }, h("h2", { id: "dlg-titulo" }, titulo), form);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      error.textContent = "";
      boton.disabled = true;
      const texto = boton.textContent;
      boton.textContent = "Un momento…";
      try {
        await enviar(new FormData(form));
        d.close();
        resolve(true);
      } catch (e) {
        error.textContent = (e as Error).message;
      } finally {
        boton.disabled = false;
        boton.textContent = texto;
      }
    });
    d.addEventListener("cancel", () => resolve(false));
    d.addEventListener("close", () => d.remove());
    document.body.appendChild(d);
    d.showModal();
  });
}

/** Campo con etiqueta y ayuda opcional. */
export function campo(etiqueta: string, control: HTMLElement, ayuda?: Hijo): HTMLElement {
  const id = control.id || `c-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return h("div", { class: "campo" },
    h("label", { for: id }, etiqueta),
    control,
    ayuda ? h("p", { class: "ayuda" }, ayuda) : null,
  );
}

/** Campo de contraseña con botón para mostrarla. */
export function campoSecreto(nombre: string, etiqueta: string, opciones: { autocomplete?: string; ayuda?: Hijo; requerido?: boolean } = {}) {
  const input = h("input", {
    type: "password", name: nombre, autocomplete: opciones.autocomplete ?? "off", required: opciones.requerido ?? true,
    spellcheck: "false", autocapitalize: "off",
  });
  const ver = h("button", { type: "button", class: "boton-icono boton-ver", "aria-label": "Mostrar", "aria-pressed": "false" }, icono("ojo"));
  ver.addEventListener("click", () => {
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    ver.setAttribute("aria-pressed", String(visible));
  });
  const fila = h("div", { class: "fila-secreto" }, input, ver);
  const c = campo(etiqueta, fila, opciones.ayuda);
  c.querySelector("label")!.setAttribute("for", input.id = `c-${nombre}-${Math.random().toString(36).slice(2, 7)}`);
  return c;
}

export function descargar(nombre: string, contenido: string, tipo = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h("a", { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copiar(texto: string, aviso = "Copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    tostada(aviso);
  } catch {
    tostada("No se ha podido copiar. Selecciónalo y cópialo a mano.", "error");
  }
}

/** Ejecuta una acción con el botón desactivado y muestra el error si falla. */
export async function conBoton(boton: HTMLButtonElement, fn: () => Promise<void>, error?: HTMLElement) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Un momento…";
  if (error) error.textContent = "";
  try {
    await fn();
  } catch (e) {
    if (error) error.textContent = (e as Error).message;
    else tostada((e as Error).message, "error");
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}
