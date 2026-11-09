/**
 * Vídeos para el álbum. Para no gastar espacio, se comprimen en el propio
 * móvil (720p, H.264, unos 2,5 Mbps; el sonido se copia tal cual) con
 * Mediabunny, que usa el codificador del móvil (WebCodecs). Se carga solo al
 * subir un vídeo. Después se cifran en trozos de 8 MB (GitHub no admite
 * ficheros de más de 100 MB).
 */
export const DURACION_MAX = 180;
export const LADO_VIDEO = 1280;
export const BITRATE_VIDEO = 2_500_000;
/** Si el móvil no puede comprimir, se sube tal cual hasta este tamaño. */
export const TAMANO_MAX_SIN_COMPRIMIR = 100_000_000;
export const TROZO_VIDEO = 8 * 1024 * 1024;

export const esVideo = (a: Pick<File, "type" | "name">) => a.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(a.name);

/** «1:05». */
export const textoDuracion = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Trozos de como mucho `tam` bytes (el último, lo que quede). */
export function trocear(datos: Uint8Array<ArrayBuffer>, tam = TROZO_VIDEO): Uint8Array<ArrayBuffer>[] {
  const salida: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < datos.length; i += tam) salida.push(datos.slice(i, i + tam));
  return salida.length ? salida : [new Uint8Array(0)];
}

/** ¿Merece la pena comprimir? (más de 720p o mucho más «pesado» que el objetivo). */
export function hayQueComprimir(ancho: number | null, alto: number | null, bytes: number, duracion: number): boolean {
  const lado = Math.max(ancho ?? 0, alto ?? 0);
  const bitrate = (bytes * 8) / Math.max(1, duracion);
  return lado > LADO_VIDEO || bitrate > BITRATE_VIDEO * 1.6;
}

export interface VideoPreparado {
  datos: Uint8Array<ArrayBuffer>;
  tipo: string;
  duracion: number;
  ancho: number | null;
  alto: number | null;
  /** Cuándo se grabó (si lo dice el vídeo). */
  grabado: Date | null;
  comprimido: boolean;
  /** Fotograma para la miniatura (480 px) y para la portada en el visor (1280 px). */
  mini: Blob | null;
  vista: Blob | null;
}

async function aJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, calidad: number): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: calidad });
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo sacar la portada."))), "image/jpeg", calidad));
}

export async function prepararVideo(archivo: File, alAvanzar: (texto: string) => void = () => {}): Promise<VideoPreparado> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.ALL_FORMATS });
  try {
    const duracion = await input.computeDuration();
    if (duracion > DURACION_MAX + 1) {
      throw new Error(`Dura ${textoDuracion(duracion)} y el máximo son ${textoDuracion(DURACION_MAX)}: recórtalo en la galería y vuelve a probar.`);
    }
    const pista = await input.getPrimaryVideoTrack();
    if (!pista) throw new Error("No es un vídeo.");
    const ancho = pista.displayWidth || null;
    const alto = pista.displayHeight || null;
    const etiquetas = await input.getMetadataTags().catch(() => ({} as { date?: Date }));

    // Portada: un fotograma del principio (o del medio si es muy corto).
    let mini: Blob | null = null;
    let vista: Blob | null = null;
    try {
      const t = Math.min(1, duracion / 3);
      const horizontal = (ancho ?? 1) >= (alto ?? 1);
      const grande = await new mb.CanvasSink(pista, horizontal ? { width: Math.min(LADO_VIDEO, ancho ?? LADO_VIDEO) } : { height: Math.min(LADO_VIDEO, alto ?? LADO_VIDEO) }).getCanvas(t);
      const peque = await new mb.CanvasSink(pista, horizontal ? { width: 480 } : { height: 480 }).getCanvas(t);
      if (grande) vista = await aJpeg(grande.canvas, 0.8);
      if (peque) mini = await aJpeg(peque.canvas, 0.75);
    } catch {
      /* sin portada: se verá un hueco con ▶ */
    }

    if (hayQueComprimir(ancho, alto, archivo.size, duracion)) {
      try {
        alAvanzar("Comprimiendo el vídeo…");
        const salida = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
        const horizontal = (ancho ?? 1) >= (alto ?? 1);
        const conversion = await mb.Conversion.init({
          input, output: salida,
          video: horizontal ? { width: Math.min(LADO_VIDEO, ancho ?? LADO_VIDEO), bitrate: BITRATE_VIDEO, codec: "avc" }
            : { height: Math.min(LADO_VIDEO, alto ?? LADO_VIDEO), bitrate: BITRATE_VIDEO, codec: "avc" },
        });
        if (!conversion.isValid) throw new Error("No se puede comprimir en este móvil.");
        conversion.onProgress = (p) => alAvanzar(`Comprimiendo el vídeo… ${Math.round(p * 100)} %`);
        await conversion.execute();
        const buf = salida.target.buffer;
        if (buf && buf.byteLength > 0 && buf.byteLength < archivo.size) {
          // Tamaño final (se reduce el lado largo a 1280 y se mantiene la proporción).
          const escala = Math.min(1, LADO_VIDEO / Math.max(ancho ?? LADO_VIDEO, alto ?? LADO_VIDEO));
          return {
            datos: new Uint8Array(buf), tipo: "video/mp4", duracion,
            ancho: ancho ? Math.round(ancho * escala) : null, alto: alto ? Math.round(alto * escala) : null,
            grabado: etiquetas.date ?? null, comprimido: true, mini, vista,
          };
        }
      } catch {
        /* no se pudo comprimir aquí: se sube tal cual si no es muy grande */
      }
    }
    if (archivo.size > TAMANO_MAX_SIN_COMPRIMIR) {
      throw new Error("Este móvil no ha podido comprimir el vídeo y sin comprimir pasa de 100 MB. Recórtalo en la galería y vuelve a probar.");
    }
    return {
      datos: new Uint8Array(await archivo.arrayBuffer()), tipo: archivo.type || "video/mp4", duracion, ancho, alto,
      grabado: etiquetas.date ?? null, comprimido: false, mini, vista,
    };
  } finally {
    input.dispose?.();
  }
}
