/**
 * Una vista puede pedir que no se la redibuje desde fuera (por ejemplo, el
 * lienzo mientras se dibuja). La sincronización de fondo lo respeta y
 * redibuja después, al cambiar de pantalla.
 */
let comprobar: (() => boolean) | null = null;

export const bloquearRedibujo = (fn: (() => boolean) | null) => {
  comprobar = fn;
};

export const redibujoBloqueado = () => !!comprobar?.();
