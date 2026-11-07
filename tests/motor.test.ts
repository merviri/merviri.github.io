import { importarClaveDatos } from "../src/cifrado/aes";
import { RemotoMemoria } from "../src/github/memoria";
import { AlmacenMemoria } from "../src/local/almacen";
import { AlmacenCifrado } from "../src/local/cifrado";
import { fusionar, Motor } from "../src/sync/motor";
import { aleatorios } from "../src/util/bytes";

async function clave() {
  return { clave: await importarClaveDatos(aleatorios(32)), idClave: "prueba" };
}

/** Reloj controlable: cada lectura avanza 1 s salvo que se fije. */
function reloj(inicio = "2026-11-07T10:00:00.000Z") {
  let t = new Date(inicio).getTime();
  const f = () => new Date((t += 1000)).toISOString();
  f.fijar = (iso: string) => { t = new Date(iso).getTime(); };
  return f;
}

async function dispositivo(remoto: RemotoMemoria, k: Awaited<ReturnType<typeof clave>>, r = reloj(), base = new AlmacenMemoria()) {
  const m = new Motor(new AlmacenCifrado(base, k.clave), k, remoto, r, 10_000);
  await m.iniciar();
  return { m, base, r };
}

const RUTA = "datos/prueba.json";

describe("fusionar", () => {
  it("gana el más reciente y, a igualdad, siempre el mismo", () => {
    const a = { id: "x", actualizado: "2026-01-01T00:00:00.000Z", por: "p1", v: 1 };
    const b = { id: "x", actualizado: "2026-01-02T00:00:00.000Z", por: "p2", v: 2 };
    expect(fusionar(a, b)).toBe(b);
    expect(fusionar(b, a)).toBe(b);
    const c = { ...a, v: 3 };
    expect(fusionar(a, c)).toEqual(fusionar(c, a));
  });
});

describe("motor de sincronización", () => {
  it("guarda en local al momento y lo envía cifrado", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const { m } = await dispositivo(remoto, k);
    await m.guardar(RUTA, { id: "a", texto: "hola María" }, "p1");
    expect(m.lista(RUTA)).toHaveLength(1);
    expect(remoto.escrituras).toBe(0);
    await m.sincronizar();
    expect(remoto.escrituras).toBe(1);
    expect(remoto.estado.ficheros[RUTA]!.texto).not.toContain("María");
    expect(m.estado.tipo).toBe("sincronizado");
    expect(m.pendientes()).toBe(0);
  });

  it("dos dispositivos que cambian cosas distintas a la vez: se suman", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const e = await dispositivo(remoto, k);
    const ma = await dispositivo(remoto, k);
    await e.m.guardar(RUTA, { id: "uno", t: "de Elvira" }, "p1");
    await ma.m.guardar(RUTA, { id: "dos", t: "de María" }, "p2");
    await e.m.sincronizar();
    await ma.m.sincronizar(); // choca (conflicto), relee y suma
    await e.m.sincronizar();
    expect(e.m.lista(RUTA).map((r) => r.id).sort()).toEqual(["dos", "uno"]);
    expect(ma.m.lista(RUTA).map((r) => r.id).sort()).toEqual(["dos", "uno"]);
  });

  it("si las dos cambian lo mismo, gana el cambio más reciente", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const e = await dispositivo(remoto, k, reloj("2026-11-07T10:00:00.000Z"));
    const ma = await dispositivo(remoto, k, reloj("2026-11-07T10:05:00.000Z"));
    await e.m.guardar(RUTA, { id: "x", t: "antes" }, "p1");
    await ma.m.guardar(RUTA, { id: "x", t: "después" }, "p2");
    await ma.m.sincronizar();
    await e.m.sincronizar();
    await ma.m.sincronizar();
    expect(e.m.uno<{ t: string }>(RUTA, "x")?.t).toBe("después");
    expect(ma.m.uno<{ t: string }>(RUTA, "x")?.t).toBe("después");
  });

  it("un cambio propio siempre supera al anterior aunque el reloj vaya atrasado", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const r = reloj("2026-11-07T10:00:00.000Z");
    const { m } = await dispositivo(remoto, k, r);
    await m.guardar(RUTA, { id: "x", t: 1 }, "p1");
    r.fijar("2026-11-01T00:00:00.000Z");
    await m.guardar(RUTA, { id: "x", t: 2 }, "p1");
    expect(m.uno<{ t: number }>(RUTA, "x")?.t).toBe(2);
  });

  it("los borrados también viajan", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const e = await dispositivo(remoto, k);
    const ma = await dispositivo(remoto, k);
    await e.m.guardar(RUTA, { id: "x" }, "p1");
    await e.m.sincronizar();
    await ma.m.sincronizar();
    expect(ma.m.lista(RUTA)).toHaveLength(1);
    await ma.m.borrar(RUTA, "x", "p2");
    expect(ma.m.lista(RUTA)).toHaveLength(0);
    await ma.m.sincronizar();
    await e.m.sincronizar();
    expect(e.m.lista(RUTA)).toHaveLength(0);
  });

  it("sin conexión guarda los cambios y los envía al volver (también tras cerrar la app)", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const base = new AlmacenMemoria();
    const a = await dispositivo(remoto, k, reloj(), base);
    remoto.sinRed = true;
    await a.m.guardar(RUTA, { id: "x", t: "sin red" }, "p1");
    await a.m.sincronizar();
    expect(a.m.estado).toMatchObject({ tipo: "pendiente", motivo: "sin-red", cambios: 1 });
    // Se «cierra» la app y se vuelve a abrir con el mismo almacenamiento.
    const b = await dispositivo(remoto, k, reloj(), base);
    expect(b.m.pendientes()).toBe(1);
    expect(b.m.uno(RUTA, "x")).toBeTruthy();
    remoto.sinRed = false;
    await b.m.sincronizar();
    expect(b.m.pendientes()).toBe(0);
    expect(remoto.escrituras).toBe(1);
  });

  it("si otro escribe justo antes, reintenta sin perder nada", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const e = await dispositivo(remoto, k);
    const ma = await dispositivo(remoto, k);
    await e.m.guardar(RUTA, { id: "e" }, "p1");
    let una = true;
    remoto.antesDeEscribir = async () => {
      if (!una) return;
      una = false;
      remoto.antesDeEscribir = null;
      await ma.m.guardar(RUTA, { id: "m" }, "p2");
      await ma.m.sincronizar();
    };
    await e.m.sincronizar();
    expect(e.m.lista(RUTA).map((r) => r.id).sort()).toEqual(["e", "m"]);
    expect(e.m.pendientes()).toBe(0);
  });

  it("no descarga nada si no ha cambiado (etag) y no reescribe si no hay cambios reales", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const { m } = await dispositivo(remoto, k);
    await m.guardar(RUTA, { id: "x", t: 1 }, "p1");
    await m.sincronizar();
    const blob = vi.spyOn(remoto, "blob");
    await m.sincronizar();
    await m.sincronizar();
    expect(blob).not.toHaveBeenCalled();
    expect(remoto.escrituras).toBe(1);
  });

  it("un fichero cifrado con otra clave se señala como error sin romper lo demás", async () => {
    const remoto = new RemotoMemoria();
    const k1 = await clave();
    const k2 = { ...(await clave()), idClave: "otra" };
    const a = await dispositivo(remoto, k1);
    await a.m.guardar("datos/bien.json", { id: "x" }, "p1");
    await a.m.sincronizar();
    const intruso = await dispositivo(remoto, k2);
    await intruso.m.guardar("datos/mal.json", { id: "y" }, "p1");
    await intruso.m.sincronizar();
    // El intruso no puede leer bien.json, pero sí escribe el suyo.
    expect(intruso.m.estado).toMatchObject({ tipo: "pendiente", motivo: "error" });
    expect(remoto.estado.ficheros["datos/mal.json"]).toBeTruthy();
    await a.m.guardar("datos/bien.json", { id: "z" }, "p1");
    await a.m.sincronizar();
    expect(a.m.estado).toMatchObject({ tipo: "pendiente", motivo: "error" });
    expect(a.m.lista("datos/bien.json")).toHaveLength(2);
    expect(a.m.pendientes()).toBe(0);
    // Y nunca pisa un fichero que no puede leer.
    const antes = remoto.estado.ficheros["datos/mal.json"]!.texto;
    await a.m.guardar("datos/mal.json", { id: "w" }, "p1");
    await a.m.sincronizar();
    expect(remoto.estado.ficheros["datos/mal.json"]!.texto).toBe(antes);
    expect(a.m.pendientes()).toBe(1);
  });

  it("avisa a la interfaz de lo que cambia", async () => {
    const remoto = new RemotoMemoria();
    const k = await clave();
    const e = await dispositivo(remoto, k);
    const ma = await dispositivo(remoto, k);
    const vistas: string[] = [];
    ma.m.alCambiar((rutas) => vistas.push(...rutas));
    await e.m.guardar(RUTA, { id: "x" }, "p1");
    await e.m.sincronizar();
    await ma.m.sincronizar();
    expect(vistas).toContain(RUTA);
  });

  it("rechaza rutas fuera de datos/", async () => {
    const remoto = new RemotoMemoria();
    const { m } = await dispositivo(remoto, await clave());
    await expect(m.guardar("llavero.json", { id: "x" }, "p1")).rejects.toThrow(/Ruta/);
  });
});
