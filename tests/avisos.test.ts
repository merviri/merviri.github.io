import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { avisoEnBytes, cifrarAviso } from "../src/avisos/push";
import { enSilencio, enumerar, horaMadrid, instanteMadrid, planificar, quiere, type Suscripcion } from "../src/dominio/avisos";
import { PAREJA_INICIAL } from "../src/dominio/pareja";
import type { Tarea } from "../src/dominio/tareas";
import { aBase64Url, desdeBase64Url, desdeUtf8, unir, utf8 } from "../src/util/bytes";
// @ts-expect-error: módulo JS sin tipos (se ejecuta en GitHub Actions)
import { claveVapid, jwtVapid, principal, problemaEnvio } from "../avisos-datos/.github/avisos/enviar.mjs";

/** Descifrado del lado del móvil (RFC 8291), escrito aparte para comprobar el cifrado. */
async function descifrarComoMovil(cuerpo: Uint8Array<ArrayBuffer>, uaPar: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>) {
  const sal = cuerpo.slice(0, 16);
  const rs = new DataView(cuerpo.buffer, cuerpo.byteOffset).getUint32(16);
  const idlen = cuerpo[20]!;
  const asPublica = cuerpo.slice(21, 21 + idlen);
  const cifrado = cuerpo.slice(21 + idlen);
  expect(rs).toBe(4096);
  const claveAs = await crypto.subtle.importKey("raw", asPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: claveAs }, uaPar.privateKey, 256));
  const uaPublica = new Uint8Array(await crypto.subtle.exportKey("raw", uaPar.publicKey));
  const h = async (s: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, n: number) => {
    const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info }, k, n * 8));
  };
  const ikm = await h(auth, ecdh, unir(utf8("WebPush: info\0"), uaPublica, asPublica), 32);
  const cek = await h(sal, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await h(sal, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, cifrado));
  expect(claro[claro.length - 1]).toBe(2);
  return desdeUtf8(claro.slice(0, -1));
}

async function movil() {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = aBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey)));
  return { par, auth, claves: { p256dh, auth: aBase64Url(auth) } };
}

describe("cifrado de avisos (RFC 8291)", () => {
  it("el móvil de destino lo abre y nadie más", async () => {
    const m = await movil();
    const otro = await movil();
    const aviso = { t: "🎨 Elvira te ha dejado un dibujo", b: "Ábrelo en Merviri ✨", r: "dibujo/abc", e: "dibujo-abc" };
    const cuerpo = await cifrarAviso(m.claves, avisoEnBytes(aviso));
    expect(new TextDecoder().decode(cuerpo)).not.toContain("Elvira");
    expect(JSON.parse(await descifrarComoMovil(cuerpo, m.par, m.auth))).toEqual(aviso);
    await expect(descifrarComoMovil(cuerpo, otro.par, otro.auth)).rejects.toThrow();
  });

  it("dos cifrados del mismo aviso son distintos", async () => {
    const m = await movil();
    const a = await cifrarAviso(m.claves, utf8("hola"));
    const b = await cifrarAviso(m.claves, utf8("hola"));
    expect(aBase64Url(a)).not.toBe(aBase64Url(b));
  });

  it("rechaza claves que no son de un móvil", async () => {
    await expect(cifrarAviso({ p256dh: aBase64Url(new Uint8Array(10)), auth: aBase64Url(new Uint8Array(16)) }, utf8("x")))
      .rejects.toThrow(/clave/);
  });
});

describe("horas y silencio", () => {
  it("hora de Madrid, invierno y verano", () => {
    expect(horaMadrid(new Date("2026-11-07T22:30:00Z"))).toBe("23:30");
    expect(horaMadrid(new Date("2026-07-07T22:30:00Z"))).toBe("00:30");
    expect(instanteMadrid("2026-11-08", "09:00").toISOString()).toBe("2026-11-08T08:00:00.000Z");
    expect(instanteMadrid("2026-07-08", "09:00").toISOString()).toBe("2026-07-08T07:00:00.000Z");
    expect(instanteMadrid("2026-03-29", "09:00").toISOString()).toBe("2026-03-29T07:00:00.000Z"); // día del cambio de hora
  });

  it("silencio que cruza la medianoche", () => {
    const p = { tipos: {}, silencioDesde: "23:00", silencioHasta: "08:00" };
    expect(enSilencio(p, new Date("2026-11-07T22:30:00Z"))).toBe(true); // 23:30
    expect(enSilencio(p, new Date("2026-11-08T06:30:00Z"))).toBe(true); // 07:30
    expect(enSilencio(p, new Date("2026-11-08T07:30:00Z"))).toBe(false); // 08:30
    expect(enSilencio({ ...p, silencioDesde: null }, new Date("2026-11-07T22:30:00Z"))).toBe(false);
  });

  it("enumera bonito", () => {
    expect(enumerar(["a"])).toBe("a");
    expect(enumerar(["a", "b", "c"])).toBe("a, b y c");
    expect(enumerar(["a", "b", "c", "d", "e"])).toBe("a, b, c y 2 más");
  });
});

describe("plan de avisos con hora", () => {
  const sub = (id: string, persona: "p1" | "p2", tipos = {}): Suscripcion =>
    ({ id, persona, nombre: id, endpoint: "https://fcm.googleapis.com/x", p256dh: "", auth: "", prefs: { tipos, silencioDesde: null, silencioHasta: null } });
  const tarea = (t: Partial<Tarea>): Tarea => ({
    id: "t", titulo: "Basura", notas: null, responsable: "p1", turno: null, fecha: null, repeticion: null,
    hecha: false, hechaPor: null, hechaEn: null, recordatorio: null, ...t,
  });

  it("resumen de la mañana para quien le toca, y nada hoy si ya pasaron las 9", () => {
    const plan = planificar({
      tareas: [tarea({ id: "a", titulo: "Basura", fecha: "2026-11-08" }), tarea({ id: "b", titulo: "Fontanero", fecha: "2026-11-09", responsable: "p2" }),
        tarea({ id: "c", titulo: "Hecha", fecha: "2026-11-08", hecha: true })],
      pareja: PAREJA_INICIAL,
      suscripciones: [sub("movil-e", "p1"), sub("movil-m", "p2")],
      ahora: new Date("2026-11-07T10:00:00Z"), hoy: "2026-11-07", dias: 3,
    });
    expect(plan.map((p) => [p.cuando, p.dispositivo, p.aviso.b])).toEqual([
      ["2026-11-08T08:00:00.000Z", "movil-e", "Hoy: ✅ Basura"],
      ["2026-11-09T08:00:00.000Z", "movil-e", "Hoy: ✅ Basura (1 atrasada)"],
      ["2026-11-09T08:00:00.000Z", "movil-m", "Hoy: ✅ Fontanero"],
    ]);
  });

  it("aniversarios y días redondos para las dos (si lo quieren)", () => {
    const plan = planificar({
      tareas: [], pareja: { ...PAREJA_INICIAL, juntasDesde: "2023-11-10" },
      suscripciones: [sub("e", "p1"), sub("m", "p2", { aniversario: false })],
      ahora: new Date("2026-11-07T10:00:00Z"), hoy: "2026-11-07", dias: 7,
    });
    expect(plan.map((p) => [p.dispositivo, p.aviso.b, p.cuando.slice(0, 10)])).toEqual([["e", "¡Hoy hace 3 años que estáis juntas!", "2026-11-10"]]);
    expect(quiere(sub("x", "p1"), "nota")).toBe(false);
  });
});

describe("envío desde GitHub Actions", () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = JSON.stringify(privateKey.export({ format: "jwk" }));

  it("firma el JWT de VAPID con ES256", () => {
    const clave = claveVapid(jwk);
    const jwt: string = jwtVapid("https://fcm.googleapis.com", clave.privada, 1_800_000_000);
    const [c, d, f] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(desdeUtf8(desdeBase64Url(d)))).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://merviri.github.io" });
    const publica = createPublicKey(privateKey);
    expect(verify("sha256", Buffer.from(`${c}.${d}`), { key: publica, dsaEncoding: "ieee-p1363" }, Buffer.from(desdeBase64Url(f)))).toBe(true);
    expect(desdeBase64Url(clave.publica)).toHaveLength(65);
  });

  it("solo admite servicios de avisos conocidos", () => {
    const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", cuerpo: "AAAA", ttl: 60, urgencia: "high" };
    expect(problemaEnvio(ok)).toBeNull();
    expect(problemaEnvio({ ...ok, endpoint: "https://evil.example.com/x" })).toMatch(/no admitido/);
    expect(problemaEnvio({ ...ok, endpoint: "http://fcm.googleapis.com/x" })).toMatch(/no admitido/);
    expect(problemaEnvio({ ...ok, cuerpo: "con espacios" })).toMatch(/cuerpo/);
    expect(problemaEnvio({ ...ok, urgencia: "ya" })).toMatch(/urgencia/);
  });

  it("al momento: manda lo que llega y no muestra nada privado", async () => {
    const llamadas: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
    const fetchFalso = async (url: string, init: { headers: Record<string, string>; body: Buffer }) => {
      llamadas.push({ url, headers: init.headers, body: init.body });
      return { status: 201 };
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await principal({
      EVENTO: "workflow_dispatch", VAPID_PRIVADA: jwk,
      ENVIOS: JSON.stringify([
        { endpoint: "https://fcm.googleapis.com/fcm/send/secreto", cuerpo: "AQID", ttl: 86400, urgencia: "high" },
        { endpoint: "https://otra.cosa/x", cuerpo: "AQID", ttl: 1, urgencia: "high" },
      ]),
    }, fetchFalso);
    expect(r).toEqual({ enviados: 1, caducados: 0, rechazados: 1, fallidos: 0 });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(llamadas[0]!.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect([...llamadas[0]!.body]).toEqual([1, 2, 3]);
    expect(log.mock.calls.flat().join(" ")).not.toContain("secreto");
    log.mockRestore();
  });

  it("cada hora: manda los programados desde la última ejecución buena", async () => {
    const ahora = Date.parse("2026-11-08T08:05:00Z");
    const programados = JSON.stringify({
      version: 1,
      envios: [
        { cuando: "2026-11-08T08:00:00.000Z", endpoint: "https://fcm.googleapis.com/a", cuerpo: "AA", ttl: 3600, urgencia: "normal" },
        { cuando: "2026-11-08T06:00:00.000Z", endpoint: "https://fcm.googleapis.com/ya-mandado", cuerpo: "AA", ttl: 3600, urgencia: "normal" },
        { cuando: "2026-11-08T09:00:00.000Z", endpoint: "https://fcm.googleapis.com/futuro", cuerpo: "AA", ttl: 3600, urgencia: "normal" },
      ],
    });
    const enviados: string[] = [];
    const fetchFalso = async (url: string) => {
      if (url.startsWith("https://api.github.com/")) {
        return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ run_started_at: "2026-11-08T07:05:00Z" }] }) };
      }
      enviados.push(url);
      return { status: 201 };
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await principal({ EVENTO: "schedule", VAPID_PRIVADA: jwk, REPO: "merviri/datos", GITHUB_TOKEN: "x" }, fetchFalso, async () => programados, ahora);
    log.mockRestore();
    expect(enviados).toEqual(["https://fcm.googleapis.com/a"]);
  });
});
