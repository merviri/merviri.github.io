import type { Merviri } from "../src/app/app";
import { ServicioAlbum } from "../src/app/album";
import { importarClaveDatos } from "../src/cifrado/aes";
import { abrirBinario, cerrarBinario } from "../src/cifrado/binario";
import { ErrorDescifrado } from "../src/cifrado/errores";
import { deAlbum, elegirRepo, fechaDeNombre, LIMITE_REPO, nombreDescarga, nombreEnZip, porMes, rutaArchivo, rutaFotos, type Foto } from "../src/dominio/album";
import { fechaExif } from "../src/fotos/exif";
import { crc32, crearZip } from "../src/fotos/zip";
import { FotosMemoria } from "../src/github/fotos";
import { AlmacenMemoria } from "../src/local/almacen";
import { aleatorios, utf8 } from "../src/util/bytes";

/** JPEG mínimo con EXIF DateTimeOriginal (big endian). */
function jpegConExif(fecha: string): Uint8Array {
  const tiff: number[] = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8];
  // IFD0 (en 8): 1 entrada → puntero a ExifIFD (tag 0x8769, LONG) en 26
  tiff.push(0, 1, 0x87, 0x69, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0);
  // ExifIFD (en 26): 1 entrada → DateTimeOriginal (0x9003, ASCII, 20) en 44
  tiff.push(0, 1, 0x90, 0x03, 0, 2, 0, 0, 0, 20, 0, 0, 0, 44, 0, 0, 0, 0);
  for (const c of `${fecha}\0`) tiff.push(c.charCodeAt(0));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const largo = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, largo >> 8, largo & 0xff, ...app1, 0xff, 0xd9]);
}

const foto = (f: Partial<Foto>): Foto => ({
  id: "f", repo: "fotos-1", base: "fotos/2026/11/f", fecha: "2026-11-07", hora: "18:30", nombre: "IMG.jpg", tipo: "image/jpeg",
  ancho: 100, alto: 100, bytes: 1000, sinVista: false, albumes: [], favorita: false, papelera: null, ...f,
});

describe("fotos: utilidades", () => {
  it("lee la fecha EXIF", () => {
    expect(fechaExif(jpegConExif("2026:11:07 18:30:12"))).toEqual({ fecha: "2026-11-07", hora: "18:30" });
    expect(fechaExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(fechaExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
  });

  it("CRC32 y ZIP bien formados", async () => {
    expect(crc32(utf8("123456789"))).toBe(0xcbf43926); // valor de referencia del CRC-32
    const zip = new Uint8Array(await crearZip([{ nombre: "Álbum/una.jpg", datos: utf8("abc") }, { nombre: "Álbum/dos.jpg", datos: utf8("defg") }]).arrayBuffer());
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(zip.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(zip.length - 22 + 10, true)).toBe(2);
  });

  it("cifrado binario atado a la ruta y a la clave", async () => {
    const k = { clave: await importarClaveDatos(aleatorios(32)), idClave: "abc123def456" };
    const c = await cerrarBinario(k, "fotos/a.orig", utf8("foto"));
    expect(new TextDecoder().decode(await abrirBinario(k, "fotos/a.orig", c))).toBe("foto");
    await expect(abrirBinario(k, "fotos/b.orig", c)).rejects.toBeInstanceOf(ErrorDescifrado);
    await expect(abrirBinario({ ...k, idClave: "otra" }, "fotos/a.orig", c)).rejects.toThrow(/otra clave/);
  });
});

describe("álbum", () => {
  it("elige repositorio y pasa al siguiente al llenarse", () => {
    expect(elegirRepo([])).toBe("fotos-1");
    expect(elegirRepo([{ repo: "fotos-1", bytes: LIMITE_REPO - 10 }], 100)).toBe("fotos-2");
    expect(elegirRepo(["fotos-1", "fotos-2", "fotos-3", "fotos-4", "fotos-5"].map((repo) => ({ repo, bytes: LIMITE_REPO })), 1)).toBeNull();
  });

  it("agrupa por meses, sin la papelera, y por álbum", () => {
    const fs = [foto({ id: "a", fecha: "2026-10-01" }), foto({ id: "b", fecha: "2026-11-05" }), foto({ id: "c", fecha: "2026-11-06", papelera: "x" }),
      foto({ id: "d", fecha: "2026-11-01", albumes: ["lisboa"] })];
    expect(porMes(fs).map(([m, l]) => [m, l.map((f) => f.id)])).toEqual([["2026-11", ["b", "d"]], ["2026-10", ["a"]]]);
    expect(deAlbum(fs, "lisboa").map((f) => f.id)).toEqual(["d"]);
    expect(nombreEnZip(foto({ id: "abcdefgh" }))).toBe("2026-11-07 18.30 (abcdef).jpg");
  });

  it("vaciar la papelera quita las fotos del repositorio y sus fichas", async () => {
    const k = { clave: await importarClaveDatos(aleatorios(32)), idClave: "id" };
    const repo = new FotosMemoria("fotos-1");
    const datos: Record<string, Record<string, Foto & { borrado?: boolean }>> = {};
    const guardadas = [foto({ id: "si", base: "fotos/2026/11/si" }), foto({ id: "no", base: "fotos/2026/11/no", papelera: new Date().toISOString() })];
    for (const f of guardadas) {
      (datos[rutaFotos(f.fecha)] ??= {})[f.id] = f;
      for (const t of ["mini", "vista", "orig"] as const) await repo.subir(rutaArchivo(f, t), await cerrarBinario(k, rutaArchivo(f, t), utf8(`${f.id}-${t}`)));
    }
    const app = {
      motor: { rutasCon: () => Object.keys(datos) },
      lista: (r: string) => Object.values(datos[r] ?? {}).filter((x) => !x.borrado),
      uno: () => undefined,
      guardar: async () => {},
      borrar: async (r: string, id: string) => { datos[r]![id]!.borrado = true; },
    } as unknown as Merviri;
    const s = new ServicioAlbum(app, () => repo, k, new AlmacenMemoria());
    expect(await s.vaciarPapelera()).toBe(1000);
    expect([...repo.ficheros.keys()].sort()).toEqual(["fotos/2026/11/si.mini", "fotos/2026/11/si.orig", "fotos/2026/11/si.vista"]);
    expect(s.fotos().map((f) => f.id)).toEqual(["si"]);
  });
});

describe("fotos: fechas y nombres", () => {
  it("saca la fecha del nombre del archivo cuando no hay EXIF", () => {
    const hoyF = "2026-11-09";
    expect(fechaDeNombre("IMG_20260415_183012.jpg", hoyF)).toEqual({ fecha: "2026-04-15", hora: "18:30" });
    expect(fechaDeNombre("IMG-20260415-WA0012.jpg", hoyF)).toEqual({ fecha: "2026-04-15", hora: null });
    expect(fechaDeNombre("WhatsApp Image 2026-04-15 at 18.30.12.jpeg", hoyF)).toEqual({ fecha: "2026-04-15", hora: "18:30" });
    expect(fechaDeNombre("Screenshot_20260415-183012.png", hoyF)).toEqual({ fecha: "2026-04-15", hora: "18:30" });
    expect(fechaDeNombre("20260415_183012.jpg", hoyF)).toEqual({ fecha: "2026-04-15", hora: "18:30" });
    expect(fechaDeNombre("PXL_20260415_163012345.jpg", hoyF)?.fecha).toBe("2026-04-15");
    // Sin fecha, imposible o del futuro: nada.
    expect(fechaDeNombre("1000012345.jpg", hoyF)).toBeNull();
    expect(fechaDeNombre("IMG_20260231_120000.jpg", hoyF)).toBeNull();
    expect(fechaDeNombre("IMG_20270101_120000.jpg", hoyF)).toBeNull();
  });

  it("lee el EXIF también dentro de un HEIC (o WebP)", () => {
    const jpeg = jpegConExif("2026:04:15 18:30:12");
    // El bloque «Exif\0\0» + TIFF metido en un contenedor que no es JPEG.
    const heic = new Uint8Array([0, 0, 0, 24, ...utf8("ftypheic"), 0, 0, 0, 0, ...utf8("mif1heic"), ...jpeg.slice(6, -2)]);
    expect(fechaExif(heic)).toEqual({ fecha: "2026-04-15", hora: "18:30" });
  });

  it("descarga con la fecha y el álbum en el nombre", () => {
    const albumes = [{ id: "lis", nombre: "Escapada a Lisboa" }, { id: "x", nombre: "Raro: a/b*c" }];
    expect(nombreDescarga(foto({ id: "abcdefgh", albumes: ["lis"] }), albumes)).toBe("2026-11-07 18.30 - Escapada a Lisboa (abcdef).jpg");
    expect(nombreDescarga(foto({ id: "abcdefgh", albumes: ["x"] }), albumes)).toBe("2026-11-07 18.30 - Raro a b c (abcdef).jpg");
    expect(nombreDescarga(foto({ id: "abcdefgh", hora: null, nombre: "IMG.HEIC", tipo: "image/heic" }))).toBe("2026-11-07 (abcdef).heic");
  });

  it("cambiar la fecha mueve la ficha de año si hace falta", async () => {
    const datos: Record<string, Record<string, Foto & { borrado?: boolean; actualizado: string }>> = {};
    let reloj = 0;
    const app = {
      motor: { rutasCon: () => Object.keys(datos) },
      lista: (r: string) => Object.values(datos[r] ?? {}).filter((x) => !x.borrado),
      guardar: async (r: string, f: Foto) => { (datos[r] ??= {})[f.id] = { ...f, actualizado: String(++reloj).padStart(4, "0") }; },
      borrar: async (r: string, id: string) => { datos[r]![id]!.borrado = true; },
    } as unknown as Merviri;
    const s = new ServicioAlbum(app, () => new FotosMemoria("fotos-1"), { clave: await importarClaveDatos(aleatorios(32)), idClave: "id" }, new AlmacenMemoria());
    await app.guardar(rutaFotos("2026-11-09"), foto({ id: "a", fecha: "2026-11-09" }));
    await app.guardar(rutaFotos("2026-11-09"), foto({ id: "b", fecha: "2026-11-09" }));
    expect(await s.cambiarFecha(s.fotos().filter((f) => f.id === "a"), "2026-04-15")).toBe(1);
    expect(s.fotos().find((f) => f.id === "a")?.fecha).toBe("2026-04-15");
    expect(await s.cambiarFecha(s.fotos().filter((f) => f.id === "b"), "2025-12-31")).toBe(1);
    expect(datos[rutaFotos("2025-12-31")]?.b?.fecha).toBe("2025-12-31");
    expect(datos[rutaFotos("2026-01-01")]?.b?.borrado).toBe(true);
    expect(s.fotos().map((f) => `${f.id}:${f.fecha}`).sort()).toEqual(["a:2026-04-15", "b:2025-12-31"]);
    // El mismo día: no hace nada.
    expect(await s.cambiarFecha(s.fotos().filter((f) => f.id === "a"), "2026-04-15")).toBe(0);
  });
});
