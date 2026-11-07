import { ALTO, ANCHO, codificarPuntos, decodificarPuntos, type Trazo } from "../dominio/dibujos";
import { h } from "./dom";

/** Trazo mientras se dibuja: puntos absolutos en el lienzo lógico (900×1600). */
export interface TrazoVivo {
  c: string;
  g: number;
  puntos: [number, number][];
}

export const aTrazos = (vivos: TrazoVivo[]): Trazo[] => vivos.map((t) => ({ c: t.c, g: t.g, p: codificarPuntos(t.puntos) }));
export const deTrazos = (trazos: Trazo[]): TrazoVivo[] => trazos.map((t) => ({ c: t.c, g: t.g, puntos: decodificarPuntos(t.p) }));

/** Pinta los trazos en un contexto ya escalado al lienzo lógico. */
export function pintar(ctx: CanvasRenderingContext2D, fondo: string, trazos: TrazoVivo[]) {
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const t of trazos) {
    const p = t.puntos;
    if (!p.length) continue;
    ctx.strokeStyle = t.c;
    ctx.fillStyle = t.c;
    ctx.lineWidth = t.g;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0]![0], p[0]![1], t.g / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(p[0]![0], p[0]![1]);
    for (let i = 1; i < p.length - 1; i++) {
      const [x, y] = p[i]!;
      const [nx, ny] = p[i + 1]!;
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    const ultimo = p[p.length - 1]!;
    ctx.lineTo(ultimo[0], ultimo[1]);
    ctx.stroke();
  }
}

/**
 * Lienzo en pantalla (proporción 9:16, como un móvil). Si `alDibujar` está,
 * se puede dibujar con el dedo o el ratón.
 */
export function crearLienzo(opciones: {
  fondo: () => string;
  trazos: () => TrazoVivo[];
  pincel?: () => { color: string; grosor: number };
  alDibujar?: (t: TrazoVivo) => void;
  etiqueta: string;
  clase?: string;
}): { el: HTMLCanvasElement; repintar: () => void } {
  const canvas = h("canvas", { class: `lienzo ${opciones.clase ?? ""}`, role: "img", "aria-label": opciones.etiqueta });
  const ctx = canvas.getContext("2d")!;
  let actual: TrazoVivo | null = null;

  const repintar = () => {
    const ancho = canvas.clientWidth || 300;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(ancho * dpr);
    const hgt = Math.round((ancho * ALTO / ANCHO) * dpr);
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w;
      canvas.height = hgt;
    }
    ctx.setTransform(w / ANCHO, 0, 0, hgt / ALTO, 0, 0);
    pintar(ctx, opciones.fondo(), actual ? [...opciones.trazos(), actual] : opciones.trazos());
  };

  let montado = false;
  const ro = new ResizeObserver(() => {
    if (canvas.isConnected) montado = true;
    else if (montado) return ro.disconnect();
    repintar();
  });
  ro.observe(canvas);

  if (opciones.alDibujar && opciones.pincel) {
    canvas.classList.add("editable");
    const punto = (ev: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [((ev.clientX - r.left) / r.width) * ANCHO, ((ev.clientY - r.top) / r.height) * ALTO];
    };
    let pendiente = false;
    const programar = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; repintar(); });
    };
    canvas.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      canvas.setPointerCapture(ev.pointerId);
      const { color, grosor } = opciones.pincel!();
      actual = { c: color, g: grosor, puntos: [punto(ev)] };
      programar();
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!actual) return;
      const eventos = typeof ev.getCoalescedEvents === "function" ? ev.getCoalescedEvents() : [ev];
      for (const e of eventos.length ? eventos : [ev]) {
        const p = punto(e);
        const u = actual.puntos[actual.puntos.length - 1]!;
        if (Math.hypot(p[0] - u[0], p[1] - u[1]) >= 2.5) actual.puntos.push(p);
      }
      programar();
    });
    const terminar = () => {
      if (!actual) return;
      const t = actual;
      actual = null;
      opciones.alDibujar!(t);
      repintar();
    };
    canvas.addEventListener("pointerup", terminar);
    canvas.addEventListener("pointercancel", terminar);
  }

  requestAnimationFrame(repintar);
  return { el: canvas, repintar };
}

/** PNG del dibujo a 1080×1920 (sirve de fondo de pantalla). */
export async function aPng(fondo: string, trazos: TrazoVivo[]): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext("2d")!;
  ctx.setTransform(1080 / ANCHO, 0, 0, 1920 / ALTO, 0, 0);
  pintar(ctx, fondo, trazos);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen."))), "image/png"));
}
