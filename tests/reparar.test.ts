import type { Merviri } from "../src/app/app";
import { ServicioAlbum } from "../src/app/album";
import { importarClaveDatos } from "../src/cifrado/aes";
import { cerrarBinario } from "../src/cifrado/binario";
import { archivosDe, baseDeArchivo, rutaArchivo, rutaFotos, type Foto } from "../src/dominio/album";
import { ClienteFotos, FotosMemoria } from "../src/github/fotos";
import { AlmacenMemoria } from "../src/local/almacen";
import { aleatorios, utf8 } from "../src/util/bytes";

const foto = (f: Partial<Foto>): Foto => ({
  id: "f", repo: "fotos-1", base: "fotos/2026/11/f", fecha: "2026-11-08", hora: "21:44", nombre: "IMG.jpg", tipo: "image/jpeg",
  ancho: 100, alto: 100, bytes: 1000, sinVista: false, albumes: [], favorita: false, papelera: null, ...f,
});

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

describe("fotos: GitHub a la vez desde dos móviles", () => {
  it("si la otra sube a la vez (409) se reintenta, y un 422 que no es «ya existe» es un error", async () => {
    let llamadas = 0;
    const c = new ClienteFotos("merviri", "fotos-1", "tok", "main", (async () => (++llamadas < 3 ? json(409, { message: "is at x but expected y" }) : json(201, {}))) as typeof fetch);
    await c.subir("fotos/a.mini", utf8("x"));
    expect(llamadas).toBe(3);
    const yaEsta = new ClienteFotos("merviri", "fotos-1", "tok", "main", (async () => json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' })) as typeof fetch);
    await expect(yaEsta.subir("fotos/a.mini", utf8("x"))).resolves.toBeUndefined();
    const otro = new ClienteFotos("merviri", "fotos-1", "tok", "main", (async () => json(422, { message: "content is not valid Base64" })) as typeof fetch);
    await expect(otro.subir("fotos/a.mini", utf8("x"))).rejects.toThrow(/Base64/);
  });

  it("vaciar la papelera no pisa una foto subida mientras se vacía", async () => {
    // La rama se mueve (otra subida) justo antes de forzarla: hay que volver a empezar.
    let cabeza = "c1";
    let lecturasRef = 0;
    const pedidas: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      const m = init?.method ?? "GET";
      pedidas.push(`${m} ${u.replace("https://api.github.com/repos/merviri/fotos-1", "")}`);
      if (u.includes("/git/ref/heads/main")) {
        lecturasRef++;
        if (lecturasRef === 2) cabeza = "c2"; // alguien subió algo entre medias
        return json(200, { object: { sha: cabeza } });
      }
      if (u.includes("/git/trees/c1")) return json(200, { tree: [{ path: "a.orig", type: "blob", sha: "1", mode: "100644" }, { path: "b.orig", type: "blob", sha: "2", mode: "100644" }] });
      if (u.includes("/git/trees/c2")) return json(200, { tree: [{ path: "a.orig", type: "blob", sha: "1", mode: "100644" }, { path: "b.orig", type: "blob", sha: "2", mode: "100644" }, { path: "nueva.orig", type: "blob", sha: "3", mode: "100644" }] });
      if (u.endsWith("/git/trees") && m === "POST") return json(201, { sha: "t" + JSON.parse(String(init!.body)).tree.length });
      if (u.endsWith("/git/commits")) return json(201, { sha: "nuevo-" + JSON.parse(String(init!.body)).tree });
      if (u.includes("/git/refs/heads/main") && m === "PATCH") return json(200, {});
      return json(404, { message: "?" });
    }) as typeof fetch;
    const c = new ClienteFotos("merviri", "fotos-1", "tok", "main", f);
    vi.useFakeTimers();
    const hecho = c.vaciar((r) => r === "b.orig");
    await vi.runAllTimersAsync();
    expect(await hecho).toBe(1);
    vi.useRealTimers();
    // El árbol definitivo se hizo con la foto nueva dentro (2 ficheros: a y nueva).
    const patch = pedidas.filter((p) => p.startsWith("PATCH"));
    expect(patch).toHaveLength(1);
    expect(pedidas.filter((p) => p.startsWith("POST /git/commits"))).toHaveLength(2);
  });
});

describe("fotos: revisar lo que falta en GitHub", () => {
  it("marca las fotos que perdieron el original y descarga la copia de 1600 px", async () => {
    const k = { clave: await importarClaveDatos(aleatorios(32)), idClave: "id" };
    const repo = new FotosMemoria("fotos-1");
    const datos: Record<string, Record<string, Foto & { borrado?: boolean; actualizado: string }>> = {};
    const bien = foto({ id: "bien", base: "fotos/2026/11/bien" });
    const perdida = foto({ id: "perdida", base: "fotos/2026/11/perdida" });
    for (const f of [bien, perdida]) {
      (datos[rutaFotos(f.fecha)] ??= {})[f.id] = { ...f, actualizado: "0001" };
      for (const t of ["mini", "vista", "orig"] as const) {
        if (f.id === "perdida" && t === "orig") continue;
        await repo.subir(rutaArchivo(f, t), await cerrarBinario(k, rutaArchivo(f, t), utf8(`${f.id}-${t}`)));
      }
    }
    let reloj = 1;
    const app = {
      motor: { rutasCon: () => Object.keys(datos) },
      lista: (r: string) => Object.values(datos[r] ?? {}).filter((x) => !x.borrado),
      guardar: async (r: string, f: Foto) => { (datos[r] ??= {})[f.id] = { ...f, actualizado: String(++reloj).padStart(4, "0") }; return datos[r]![f.id]; },
      borrar: async () => {},
      uno: () => undefined,
    } as unknown as Merviri;
    const s = new ServicioAlbum(app, () => repo, k, new AlmacenMemoria());
    expect(await s.revisar(true)).toEqual({ sinOriginal: 1, arregladas: 0 });
    expect(s.fotos().find((f) => f.id === "perdida")?.sinOriginal).toBe(true);
    expect(s.fotos().find((f) => f.id === "bien")?.sinOriginal).toBeFalsy();
    // Una vez al día: la segunda vez no hace nada.
    expect(await s.revisar()).toEqual({ sinOriginal: 0, arregladas: 0 });
    const d = await s.descarga(s.fotos().find((f) => f.id === "perdida")!);
    expect(d.reducida).toBe(true);
    expect(new TextDecoder().decode(await d.blob.arrayBuffer())).toBe("perdida-vista");
    const ok = await s.descarga(bien);
    expect(ok.reducida).toBe(false);
  });

  it("sabe qué ficheros tiene cada foto", () => {
    expect(archivosDe(foto({ base: "x/y" }))).toEqual(["x/y.mini", "x/y.vista", "x/y.orig"]);
    expect(archivosDe(foto({ base: "x/y", sinVista: true }))).toEqual(["x/y.orig"]);
    expect(baseDeArchivo("fotos/2026/11/abc.orig.3")).toBe("fotos/2026/11/abc");
    expect(baseDeArchivo("fotos/2026/11/abc.mini")).toBe("fotos/2026/11/abc");
  });
});
