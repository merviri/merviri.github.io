// Merviri: envío de avisos (Web Push). Se ejecuta en GitHub Actions dentro
// del repositorio privado merviri/datos (ver ../workflows/avisos.yml).
//
// Los avisos llegan YA CIFRADOS para cada dispositivo (los cifra el móvil que
// los manda): aquí solo se firman con la clave VAPID de Merviri y se entregan
// al servicio de avisos (Google, en Android). Nunca se ve su contenido.
//
// - workflow_dispatch: envía la lista que llega en la entrada «envios».
// - schedule (cada hora): envía los de avisos/programados.json cuya hora
//   cayó desde la última ejecución programada que salió bien.
//
// Sin dependencias: solo Node (fetch y crypto de serie).

import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";

/** Servicios de avisos admitidos (para no mandar nada a otro sitio). */
const SERVICIOS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
];
const URGENCIAS = new Set(["very-low", "low", "normal", "high"]);
const MAX_ENVIOS = 60;
const MAX_CUERPO = 5000;
/** Los programados con más de 12 h de retraso ya no se mandan. */
const CADUCIDAD_MS = 12 * 3600 * 1000;
const CONTACTO = "https://merviri.github.io";

export const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Clave VAPID a partir del JWK privado (P-256) guardado como secreto. */
export function claveVapid(jwkTexto) {
  const jwk = JSON.parse(jwkTexto);
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) throw new Error("VAPID_PRIVADA no es una clave P-256 en formato JWK.");
  const privada = createPrivateKey({ key: jwk, format: "jwk" });
  const publica = Buffer.concat([Buffer.from([4]), desdeB64url(jwk.x), desdeB64url(jwk.y)]);
  return { privada, publica: b64url(publica) };
}

/** JWT de VAPID (RFC 8292) firmado con ES256. */
export function jwtVapid(audiencia, privada, ahoraSeg) {
  const cab = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const datos = b64url(JSON.stringify({ aud: audiencia, exp: ahoraSeg + 12 * 3600, sub: CONTACTO }));
  const firma = sign("sha256", Buffer.from(`${cab}.${datos}`), { key: privada, dsaEncoding: "ieee-p1363" });
  return `${cab}.${datos}.${b64url(firma)}`;
}

/** Devuelve el problema de un envío, o null si es válido. */
export function problemaEnvio(e) {
  if (!e || typeof e !== "object") return "no es un objeto";
  let url;
  try {
    url = new URL(e.endpoint);
  } catch {
    return "dirección no válida";
  }
  if (url.protocol !== "https:" || !SERVICIOS.some((r) => r.test(url.hostname))) return "servicio de avisos no admitido";
  if (typeof e.cuerpo !== "string" || !/^[A-Za-z0-9_-]+$/.test(e.cuerpo) || e.cuerpo.length > MAX_CUERPO) return "cuerpo no válido";
  if (!Number.isInteger(e.ttl) || e.ttl < 0 || e.ttl > 2419200) return "ttl no válido";
  if (!URGENCIAS.has(e.urgencia)) return "urgencia no válida";
  return null;
}

export async function enviarUno(e, clave, fetchImpl, ahoraSeg) {
  const url = new URL(e.endpoint);
  const jwt = jwtVapid(url.origin, clave.privada, ahoraSeg);
  const res = await fetchImpl(e.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${clave.publica}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(e.ttl),
      Urgency: e.urgencia,
    },
    body: desdeB64url(e.cuerpo),
  });
  return res.status;
}

/** Inicio de la última ejecución programada que salió bien (o hace 70 min). */
async function desdeUltimaEjecucion(env, fetchImpl, ahora) {
  const porDefecto = ahora - 70 * 60 * 1000;
  try {
    const res = await fetchImpl(
      `https://api.github.com/repos/${env.REPO}/actions/workflows/avisos.yml/runs?event=schedule&status=success&per_page=1`,
      { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return porDefecto;
    const j = await res.json();
    const t = Date.parse(j.workflow_runs?.[0]?.run_started_at ?? "");
    return Number.isFinite(t) && t < ahora ? Math.max(t, ahora - CADUCIDAD_MS) : porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function principal(env, fetchImpl = fetch, leer = (r) => readFile(r, "utf8"), ahora = Date.now()) {
  if (!env.VAPID_PRIVADA) throw new Error("Falta el secreto VAPID_PRIVADA.");
  const clave = claveVapid(env.VAPID_PRIVADA);
  let envios = [];
  if (env.EVENTO === "workflow_dispatch") {
    envios = JSON.parse(env.ENVIOS || "[]");
    if (!Array.isArray(envios)) throw new Error("La entrada «envios» no es una lista.");
  } else if (env.EVENTO === "schedule") {
    let prog = { envios: [] };
    try {
      prog = JSON.parse(await leer("avisos/programados.json"));
    } catch {
      /* todavía no hay programados */
    }
    const desde = await desdeUltimaEjecucion(env, fetchImpl, ahora);
    envios = (prog.envios ?? []).filter((e) => {
      const t = Date.parse(e.cuando);
      return Number.isFinite(t) && t > desde && t <= ahora && ahora - t < CADUCIDAD_MS;
    });
  } else {
    throw new Error(`Evento no esperado: ${env.EVENTO}`);
  }
  envios = envios.slice(0, MAX_ENVIOS);
  const resumen = { enviados: 0, caducados: 0, rechazados: 0, fallidos: 0 };
  for (const e of envios) {
    const problema = problemaEnvio(e);
    if (problema) {
      resumen.rechazados++;
      console.log(`Envío rechazado: ${problema}`);
      continue;
    }
    try {
      const st = await enviarUno(e, clave, fetchImpl, Math.floor(ahora / 1000));
      if (st >= 200 && st < 300) resumen.enviados++;
      else if (st === 404 || st === 410) resumen.caducados++;
      else {
        resumen.fallidos++;
        console.log(`El servicio de avisos respondió ${st}`);
      }
    } catch (err) {
      resumen.fallidos++;
      console.log(`Fallo de red: ${err.message}`);
    }
  }
  // Solo números: nunca direcciones ni contenido.
  console.log(`Avisos: ${JSON.stringify(resumen)} de ${envios.length}`);
  return resumen;
}

if (process.argv[1] && process.argv[1].endsWith("enviar.mjs")) {
  principal(process.env).then(
    (r) => { if (r.fallidos && !r.enviados) process.exitCode = 1; },
    (err) => { console.error(err.message); process.exitCode = 1; },
  );
}
