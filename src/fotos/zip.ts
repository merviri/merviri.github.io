/**
 * ZIP sin comprimir («store»): las fotos ya van comprimidas, así que basta
 * con empaquetarlas. Sin librerías; nombres en UTF-8.
 */
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArchivoZip {
  nombre: string;
  datos: Uint8Array<ArrayBuffer>;
  fecha?: Date;
}

function fechaDos(d: Date): { hora: number; dia: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    dia: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function crearZip(archivos: ArchivoZip[]): Blob {
  const partes: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let desplazamiento = 0;
  const enc = new TextEncoder();
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre) as Uint8Array<ArrayBuffer>;
    const crc = crc32(a.datos);
    const { hora, dia } = fechaDos(a.fecha ?? new Date());
    const local = new Uint8Array(30 + nombre.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // nombres en UTF-8
    l.setUint16(8, 0, true); // sin compresión
    l.setUint16(10, hora, true);
    l.setUint16(12, dia, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, a.datos.length, true);
    l.setUint32(22, a.datos.length, true);
    l.setUint16(26, nombre.length, true);
    local.set(nombre, 30);
    partes.push(local, a.datos);

    const c = new Uint8Array(46 + nombre.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, hora, true);
    cv.setUint16(14, dia, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, a.datos.length, true);
    cv.setUint32(24, a.datos.length, true);
    cv.setUint16(28, nombre.length, true);
    cv.setUint32(42, desplazamiento, true);
    c.set(nombre, 46);
    central.push(c);
    desplazamiento += local.length + a.datos.length;
  }
  const tamCentral = central.reduce((n, c) => n + c.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, archivos.length, true);
  f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, desplazamiento, true);
  return new Blob([...partes, ...central, fin], { type: "application/zip" });
}
