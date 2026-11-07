/**
 * Fecha en que se hizo una foto JPEG (EXIF DateTimeOriginal), sin librerías.
 * Devuelve «AAAA-MM-DD» y «HH:MM», o null si no la tiene.
 */
export function fechaExif(datos: Uint8Array): { fecha: string; hora: string } | null {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // no es JPEG
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
