import type { Merviri } from "../src/app/app";
import { ServicioAlbum } from "../src/app/album";
import { importarClaveDatos } from "../src/cifrado/aes";
import { cerrarBinario } from "../src/cifrado/binario";
import { archivosDe, nombreDescarga, rutaArchivo, rutaFotos, rutaParte, type Foto } from "../src/dominio/album";
import { esVideo, hayQueComprimir, textoDuracion, trocear } from "../src/fotos/video";
import { FotosMemoria } from "../src/github/fotos";
import { AlmacenMemoria } from "../src/local/almacen";
import { aleatorios, unir, utf8 } from "../src/util/bytes";

const video = (f: Partial<Foto>): Foto => ({
  id: "v", repo: "fotos-1", base: "fotos/2026/04/v", fecha: "2026-04-15", hora: "18:30", nombre: "VID_20260415_183000.mov", tipo: "video/mp4",
  ancho: 1280, alto: 720, bytes: 30, sinVista: false, albumes: [], favorita: false, papelera: null, video: { duracion: 42, partes: 3 }, ...f,
});

describe("vídeos", () => {
  it("se trocean para GitHub y se reconocen", () => {
    const datos = new Uint8Array(25).map((_, i) => i);
    const t = trocear(datos, 10);
    expect(t.map((x) => x.length)).toEqual([10, 10, 5]);
    expect(unir(...t)).toEqual(datos);
    expect(esVideo({ type: "video/mp4", name: "x" })).toBe(true);
    expect(esVideo({ type: "", name: "VID.MOV" })).toBe(true);
    expect(esVideo({ type: "image/jpeg", name: "IMG.jpg" })).toBe(false);
    expect(textoDuracion(65.4)).toBe("1:05");
  });

  it("solo se comprimen si son más de 720p o muy pesados", () => {
    expect(hayQueComprimir(1920, 1080, 130e6, 60)).toBe(true);
    expect(hayQueComprimir(1280, 720, 15e6, 60)).toBe(false); // 2 Mbps a 720p: ya está bien
    expect(hayQueComprimir(1280, 720, 60e6, 60)).toBe(true); // 8 Mbps
  });

  it("sus ficheros son la portada y los trozos, y se descargan como MP4", () => {
    expect(archivosDe(video({}))).toEqual(["fotos/2026/04/v.mini", "fotos/2026/04/v.vista", "fotos/2026/04/v.orig.0", "fotos/2026/04/v.orig.1", "fotos/2026/04/v.orig.2"]);
    expect(nombreDescarga(video({ id: "abcdefgh" }))).toBe("2026-04-15 18.30 (abcdef).mp4");
  });

  it("se baja entero juntando los trozos; si falta uno, queda marcado", async () => {
    const k = { clave: await importarClaveDatos(aleatorios(32)), idClave: "id" };
    const repo = new FotosMemoria("fotos-1");
    const v = video({});
    for (const t of ["mini", "vista"] as const) await repo.subir(rutaArchivo(v, t), await cerrarBinario(k, rutaArchivo(v, t), utf8(t)));
    for (const [i, trozo] of ["uno-", "dos-", "tres"].entries()) await repo.subir(rutaParte(v, i), await cerrarBinario(k, rutaParte(v, i), utf8(trozo)));
    const datos: Record<string, Record<string, Foto & { actualizado: string }>> = { [rutaFotos(v.fecha)]: { v: { ...v, actualizado: "0001" } } };
    let reloj = 1;
    const app = {
      motor: { rutasCon: () => Object.keys(datos) },
      lista: (r: string) => Object.values(datos[r] ?? {}),
      guardar: async (r: string, f: Foto) => { (datos[r] ??= {})[f.id] = { ...f, actualizado: String(++reloj).padStart(4, "0") }; },
    } as unknown as Merviri;
    const s = new ServicioAlbum(app, () => repo, k, new AlmacenMemoria());
    const pasos: string[] = [];
    const blob = await s.original(v, (i, n) => pasos.push(`${i}/${n}`));
    expect(await blob.text()).toBe("uno-dos-tres");
    expect(blob.type).toBe("video/mp4");
    expect(pasos).toEqual(["0/3", "1/3", "2/3", "3/3"]);
    // Se pierde un trozo: la revisión lo marca y no se puede descargar.
    repo.ficheros.delete(rutaParte(v, 1));
    expect(await s.revisar(true)).toEqual({ sinOriginal: 1, arregladas: 0 });
    await expect(s.descarga(s.fotos()[0]!)).rejects.toThrow(/parte de este vídeo/);
  });
});
