import qrcode from "qrcode-generator";
import { s } from "./dom";

/** Código QR como SVG (negro sobre blanco, con margen), construido sin innerHTML. */
export function qrSvg(texto: string, lado = 260): SVGSVGElement {
  const q = qrcode(0, "M");
  q.addData(texto, "Byte");
  q.make();
  const n = q.getModuleCount();
  const margen = 4;
  const total = n + margen * 2;
  let d = "";
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) if (q.isDark(f, c)) d += `M${c + margen} ${f + margen}h1v1h-1z`;
  }
  return s("svg", {
    viewBox: `0 0 ${total} ${total}`, width: lado, height: lado, role: "img",
    "aria-label": "Código QR para vincular otro dispositivo", "shape-rendering": "crispEdges", class: "qr",
  },
  s("rect", { width: total, height: total, fill: "#FFFFFF" }),
  s("path", { d, fill: "#000000" }));
}
