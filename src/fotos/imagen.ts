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
    const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
    const ancho = Math.max(1, Math.round(bmp.width * escala));
    const alto = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, ancho, alto);
    const blob = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo reducir la foto."))), "image/jpeg", calidad));
    return { datos: new Uint8Array(await blob.arrayBuffer()), ancho, alto, anchoOriginal: bmp.width, altoOriginal: bmp.height };
  } finally {
    bmp.close();
  }
}
