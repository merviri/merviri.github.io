import type { Merviri } from "../src/app/app";
import { Avisador } from "../src/app/avisador";
import { avisarElemento, avisarRecordatorio, avisarTarea } from "../src/app/eventos";
import { RUTA_PLAN, RUTA_PROGRAMADOS, RUTA_SUSCRIPCIONES, type Suscripcion } from "../src/dominio/avisos";
import { PAREJA_INICIAL } from "../src/dominio/pareja";
import { RUTA_TAREAS, type Tarea } from "../src/dominio/tareas";
import { RemotoMemoria } from "../src/github/memoria";
import { aBase64Url, desdeBase64Url, desdeUtf8, unir, utf8 } from "../src/util/bytes";

vi.mock("../src/avisos/vapid", () => ({ VAPID_PUBLICA: "clave-de-prueba" }));

async function movil(id: string, persona: "p1" | "p2") {
  const par = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub: Suscripcion = {
    id, persona, nombre: id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: aBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey))), auth: aBase64Url(auth),
    prefs: { tipos: {}, silencioDesde: null, silencioHasta: null },
  };
  return { sub, par, auth };
}

/** Abre un aviso como lo haría el móvil (RFC 8291). */
async function abrir(cuerpoB64: string, par: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>) {
  const c = desdeBase64Url(cuerpoB64);
  const sal = c.slice(0, 16);
  const as = c.slice(21, 86);
  const k = await crypto.subtle.importKey("raw", as, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: k }, par.privateKey, 256));
  const ua = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const h = async (s: Uint8Array<ArrayBuffer>, i: Uint8Array<ArrayBuffer>, inf: Uint8Array<ArrayBuffer>, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info: inf },
      await crypto.subtle.importKey("raw", i, "HKDF", false, ["deriveBits"]), n * 8));
  const ikm = await h(auth, ecdh, unir(utf8("WebPush: info\0"), ua, as), 32);
  const cek = await crypto.subtle.importKey("raw", await h(sal, ikm, utf8("Content-Encoding: aes128gcm\0"), 16), "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: await h(sal, ikm, utf8("Content-Encoding: nonce\0"), 12) }, cek, c.slice(86)));
  return JSON.parse(desdeUtf8(claro.slice(0, -1)));
}

function appFalsa(remoto: RemotoMemoria, persona: "p1" | "p2", datos: Record<string, Record<string, unknown>>) {
  const app = {
    persona,
    dispositivo: { id: persona === "p1" ? "movil-e" : "movil-m" },
    motor: { rama: "main" },
    remotoActual: () => remoto,
    almacenLocal: () => null,
    sincronizar: async () => {},
    pareja: () => PAREJA_INICIAL,
    lista: (ruta: string) => Object.values(datos[ruta] ?? {}),
    uno: (ruta: string, id: string) => datos[ruta]?.[id],
    guardar: async (ruta: string, d: { id: string }) => { (datos[ruta] ??= {})[d.id] = d; return d; },
  } as unknown as Merviri;
  (app as { avisador: Avisador }).avisador = new Avisador(app, 60_000);
  return app;
}

describe("avisador", () => {
  it("junta los avisos, cifra para cada móvil de la otra y no se avisa a sí misma", async () => {
    const e = await movil("movil-e", "p1");
    const m1 = await movil("movil-m", "p2");
    const m2 = await movil("tablet-m", "p2");
    const remoto = new RemotoMemoria();
    const datos = { [RUTA_SUSCRIPCIONES]: { [e.sub.id]: e.sub, [m1.sub.id]: m1.sub, [m2.sub.id]: m2.sub } };
    const app = appFalsa(remoto, "p1", datos);
    const lista = { id: "l1", nombre: "Compra", emoji: "🛒", orden: 0 };
    avisarElemento(app, lista, "leche");
    avisarElemento(app, lista, "pan");
    avisarRecordatorio(app, { id: "t1", titulo: "Sacar la basura" } as Tarea, "p2");
    await app.avisador!.vaciar();

    expect(remoto.disparos).toHaveLength(1);
    const { workflow, entradas } = remoto.disparos[0]!;
    expect(workflow).toBe("avisos.yml");
    const envios = JSON.parse(entradas.envios!) as { endpoint: string; cuerpo: string }[];
    expect(envios.map((x) => x.endpoint.split("/").pop()).sort()).toEqual(["movil-m", "movil-m", "tablet-m", "tablet-m"]);
    expect(entradas.envios).not.toContain("leche");
    const paraMovil = await Promise.all(envios.filter((x) => x.endpoint.endsWith("movil-m")).map((x) => abrir(x.cuerpo, m1.par, m1.auth)));
    expect(paraMovil).toEqual(expect.arrayContaining([
      expect.objectContaining({ t: "🛒 Compra", b: "Elvira ha añadido «leche» y «pan»", r: "lista/l1" }),
      expect.objectContaining({ t: "🔔 Elvira te recuerda", b: "Sacar la basura" }),
    ]));
  });

  it("respeta lo que cada móvil no quiere recibir y avisa solo de tareas que pasan a ser de la otra", async () => {
    const m = await movil("movil-m", "p2");
    m.sub.prefs.tipos.lista = false;
    const remoto = new RemotoMemoria();
    const app = appFalsa(remoto, "p1", { [RUTA_SUSCRIPCIONES]: { [m.sub.id]: m.sub } });
    avisarElemento(app, { id: "l", nombre: "Compra", emoji: "🛒", orden: 0 }, "leche");
    const t = { id: "t", titulo: "Fontanero", responsable: "p1", turno: null } as Tarea;
    avisarTarea(app, t, null); // es mía: no se avisa
    avisarTarea(app, { ...t, responsable: "p2" }, t); // pasa a ser suya: sí
    avisarTarea(app, { ...t, responsable: "p2", titulo: "Fontanero!" }, { ...t, responsable: "p2" }); // ya era suya: no
    await app.avisador!.vaciar();
    const envios = JSON.parse(remoto.disparos[0]!.entradas.envios!) as { cuerpo: string }[];
    expect(envios).toHaveLength(1);
    expect(await abrir(envios[0]!.cuerpo, m.par, m.auth)).toMatchObject({ t: "✅ Tarea nueva de Elvira", b: "Fontanero" });
  });

  it("deja programados los avisos con hora y no los reescribe si nada cambia", async () => {
    const m = await movil("movil-m", "p2");
    const remoto = new RemotoMemoria();
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const datos: Record<string, Record<string, unknown>> = {
      [RUTA_SUSCRIPCIONES]: { [m.sub.id]: m.sub },
      [RUTA_TAREAS]: { t: { id: "t", titulo: "Basura", responsable: "p2", turno: null, fecha: manana, repeticion: null, hecha: false } },
    };
    const app = appFalsa(remoto, "p1", datos);
    await app.avisador!.actualizarProgramados();
    const prog = JSON.parse(remoto.estado.ficheros[RUTA_PROGRAMADOS]!.texto) as { envios: { cuando: string; cuerpo: string }[] };
    expect(prog.envios.length).toBeGreaterThanOrEqual(1);
    expect(remoto.estado.ficheros[RUTA_PROGRAMADOS]!.texto).not.toContain("Basura");
    expect(await abrir(prog.envios[0]!.cuerpo, m.par, m.auth)).toMatchObject({ t: "☀️ Buenos días, María", r: "tareas" });
    expect(datos[RUTA_PLAN]).toBeTruthy();
    const escrituras = remoto.escrituras;
    await app.avisador!.actualizarProgramados();
    expect(remoto.escrituras).toBe(escrituras);
  });
});
