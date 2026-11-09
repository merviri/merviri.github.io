/**
 * Fecha en que se hizo una foto (EXIF DateTimeOriginal), sin librerías.
 * JPEG por sus marcas; HEIC, WebP y PNG buscando el bloque EXIF dentro.
 * Devuelve «AAAA-MM-DD» y «HH:MM», o null si no la tiene.
 */
export function fechaExif(datos: Uint8Array): { fecha: string; hora: string } | null {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  if (v.byteLength < 4) return null;
  if (v.getUint16(0) === 0xffd8) return fechaJpeg(v) ?? buscarExif(datos, v);
  return buscarExif(datos, v);
}

/** HEIC/WebP («Exif\0\0» + TIFF) y PNG (bloque «eXIf» con el TIFF dentro), en los primeros 2 MB. */
function buscarExif(datos: Uint8Array, v: DataView): { fecha: string; hora: string } | null {
  const fin = Math.min(datos.length, 2_000_000);
  let intentos = 0;
  for (let i = 0; i + 10 < fin && intentos < 8; i++) {
    const exif = datos[i] === 0x45 && datos[i + 1] === 0x78 && datos[i + 2] === 0x69 && datos[i + 3] === 0x66 && datos[i + 4] === 0 && datos[i + 5] === 0;
    const png = datos[i] === 0x65 && datos[i + 1] === 0x58 && datos[i + 2] === 0x49 && datos[i + 3] === 0x66;
    if (!exif && !png) continue;
    intentos++;
    const r = leerTiff(v, i + (exif ? 6 : 4), v.byteLength);
    if (r) return r;
  }
  return null;
}

function fechaJpeg(v: DataView): { fecha: string; hora: string } | null {
  let p = 2;
  while (p + 4 <= v.byteLength) {
    const marca = v.getUint16(p);
    const largo = v.getUint16(p + 2);
    if ((marca & 0xff00) !== 0xff00 || largo < 2) return null;
    if (marca === 0xffe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966) {
      return leerTiff(v, p + 10, Math.min(v.byteLength, p + 2 + largo));
    }
    if (marca === 0xffda) return null; // empieza la imagen: ya no hay EXIF
    p += 2 + largo;
  }
  return null;
}

function leerTiff(v: DataView, inicio: number, fin: number): { fecha: string; hora: string } | null {
  if (inicio + 8 > fin) return null;
  const orden = v.getUint16(inicio);
  const le = orden === 0x4949;
  if (!le && orden !== 0x4d4d) return null;
  const u16 = (o: number) => v.getUint16(inicio + o, le);
  const u32 = (o: number) => v.getUint32(inicio + o, le);
  const entradas = (ifd: number): Map<number, { tipo: number; n: number; valor: number }> => {
    const m = new Map<number, { tipo: number; n: number; valor: number }>();
    if (inicio + ifd + 2 > fin) return m;
    const total = u16(ifd);
    for (let i = 0; i < total; i++) {
      const e = ifd + 2 + i * 12;
      if (inicio + e + 12 > fin) break;
      m.set(u16(e), { tipo: u16(e + 2), n: u32(e + 4), valor: u32(e + 8) });
    }
    return m;
  };
  const texto = (e: { tipo: number; n: number; valor: number } | undefined): string | null => {
    if (!e || e.tipo !== 2 || e.n < 19 || inicio + e.valor + 19 > fin) return null;
    let s = "";
    for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(inicio + e.valor + i));
    return s;
  };
  const ifd0 = entradas(u32(4));
  const exif = ifd0.get(0x8769);
  const original = exif ? texto(entradas(exif.valor).get(0x9003)) : null;
  const t = original ?? texto(ifd0.get(0x0132));
  const m = t ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(t) : null;
  if (!m || m[1] === "0000") return null;
  return { fecha: `${m[1]}-${m[2]}-${m[3]}`, hora: `${m[4]}:${m[5]}` };
}
