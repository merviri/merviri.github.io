// Genera los iconos de Merviri: dos destellos (rosa de María y turquesa de
// Elvira) que se cruzan; donde se solapan, morado (lo de las dos).
// Uso: npm run iconos  → escribe en public/ los SVG y PNG.
import { writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const ROSA = "#D4537E";
const TURQUESA = "#17B3B0";
const MORADO = "#534AB7";

/** Destello de cuatro puntas centrado en (cx, cy). */
function destello(cx, cy, ry = 36, rx = 34) {
  const p = (dx, dy) => `${+(cx + dx).toFixed(2)} ${+(cy + dy).toFixed(2)}`;
  const k = rx / 34;
  const v = ry / 36;
  return [
    `M${p(0, -ry)}`,
    `C${p(3 * k, -10 * v)} ${p(8 * k, -5 * v)} ${p(rx, 0)}`,
    `C${p(8 * k, 5 * v)} ${p(3 * k, 10 * v)} ${p(0, ry)}`,
    `C${p(-3 * k, 10 * v)} ${p(-8 * k, 5 * v)} ${p(-rx, 0)}`,
    `C${p(-8 * k, -5 * v)} ${p(-3 * k, -10 * v)} ${p(0, -ry)}Z`,
  ].join(" ");
}

/** Los dos destellos en una caja de 100×100, escalados respecto al centro. */
function destellos(escala = 1) {
  const rosa = destello(38, 50);
  const turquesa = destello(62, 50);
  const t = escala === 1 ? "" : ` transform="translate(50 50) scale(${escala}) translate(-50 -50)"`;
  return `<defs><clipPath id="r"><path d="${rosa}"/></clipPath></defs>
  <g${t}>
    <path d="${rosa}" fill="${ROSA}"/>
    <path d="${turquesa}" fill="${TURQUESA}"/>
    <path d="${turquesa}" fill="${MORADO}" clip-path="url(#r)"/>
  </g>`;
}

const svg = (fondo, escala) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  ${fondo}
  ${destellos(escala)}
</svg>
`;

const redondeado = svg(`<rect width="100" height="100" rx="22" fill="#FFFFFF"/>`, 0.92);
const completo = svg(`<rect width="100" height="100" fill="#FFFFFF"/>`, 0.92);
const adaptable = svg(`<rect width="100" height="100" fill="#FFFFFF"/>`, 0.66);
const logo = svg("", 1);

function png(fuente, lado, fichero) {
  const r = new Resvg(fuente, { fitTo: { mode: "width", value: lado } });
  writeFileSync(`public/${fichero}`, r.render().asPng());
}

writeFileSync("public/icono.svg", redondeado);
writeFileSync("public/logo.svg", logo);
png(redondeado, 192, "icon-192.png");
png(redondeado, 512, "icon-512.png");
png(adaptable, 512, "icon-maskable-512.png");
png(completo, 180, "apple-touch-icon.png");
console.log("Iconos generados en public/");
