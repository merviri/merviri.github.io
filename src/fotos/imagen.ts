/**
 * Versiones reducidas de una foto (para ver rápido): se hacen en el móvil
 * con un canvas. El original se guarda tal cual, sin tocar.
 */
export interface Reducida {
  datos: Uint8Array<ArrayBuffer>;
  ancho: number;
  alto: number;
}

export async function reducir(original: Blob, ladoMax: number, calidad = 0.82): Promise<Reducida & { anchoOriginal: number; altoOriginal: number }> {
  const bmp = await createImageBitmap(original, { imageOrientation: "from-image" });
  try {
    return { ...(await aJpeg(bmp, ladoMax, calidad)), anchoOriginal: bmp.width, altoOriginal: bmp.height };
  } finally {
    bmp.close();
  }
}

async function aJpeg(fuente: ImageBitmap, ladoMax: number, calidad: number): Promise<Reducida> {
  const escala = Math.min(1, ladoMax / Math.max(fuente.width, fuente.height));
  const ancho = Math.max(1, Math.round(fuente.width * escala));
  const alto = Math.max(1, Math.round(fuente.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(fuente, 0, 0, ancho, alto);
  const blob = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo reducir la foto."))), "image/jpeg", calidad));
  canvas.width = canvas.height = 0; // libera la memoria del canvas enseguida
  return { datos: new Uint8Array(await blob.arrayBuffer()), ancho, alto };
}

const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Miniatura (480 px) y vista (1600 px) de una foto, abriéndola una sola vez.
 * Si el móvil va justo de memoria (subiendo muchas a la vez) se reintenta, y
 * si la foto es enorme se abre ya reducida. Lanza un error si el navegador no
 * sabe leer ese formato.
 */
export async function reducidas(original: Blob): Promise<{ mini: Reducida; vista: Reducida; ancho: number | null; alto: number | null }> {
  let bmp: ImageBitmap | null = null;
  let ancho: number | null = null;
  let alto: number | null = null;
  for (let intento = 0; intento < 2 && !bmp; intento++) {
    try {
      bmp = await createImageBitmap(original, { imageOrientation: "from-image" });
      ancho = bmp.width;
      alto = bmp.height;
    } catch {
      await pausa(400);
    }
  }
  if (!bmp) {
    // Muy grande para abrirla entera: se abre ya reducida (la altura sigue la proporción).
    bmp = await createImageBitmap(original, { imageOrientation: "from-image", resizeWidth: 2400, resizeQuality: "high" });
  }
  try {
    return { vista: await aJpeg(bmp, 1600, 0.82), mini: await aJpeg(bmp, 480, 0.75), ancho, alto };
  } finally {
    bmp.close();
  }
}
