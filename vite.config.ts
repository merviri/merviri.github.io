import { defineConfig, type Plugin } from "vitest/config";

/**
 * Política de seguridad de contenidos, solo en la versión publicada (en
 * desarrollo Vite necesita conexiones propias). La página solo puede cargar
 * sus propios ficheros y hablar con la API de GitHub. Cada fase que necesite
 * otro servicio (tiempo, agenda…) lo añadirá aquí de forma explícita.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.github.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

/** Identificador de esta compilación: la app lo compara con version.json para avisar de versiones nuevas. */
const VERSION = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13) + "-" + Math.random().toString(36).slice(2, 6);

function publicar(): Plugin {
  return {
    name: "merviri-publicar",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: VERSION }) + "\n" });
    },
  };
}

export default defineConfig({
  // merviri.github.io sirve la app en la raíz.
  base: "/",
  define: { __MERVIRI_VERSION__: JSON.stringify(VERSION) },
  plugins: [publicar()],
  build: { assetsInlineLimit: 0 },
  test: {
    globals: true,
    environment: "node",
  },
});
