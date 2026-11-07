import { aBase64Url, desdeBase64Url } from "../util/bytes";
import { VAPID_PUBLICA } from "./vapid";

/** Suscripción de este navegador a los avisos (Push API). */

export const avisosSoportados = () =>
  VAPID_PUBLICA !== "" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const permisoAvisos = (): NotificationPermission | "no-soportado" =>
  "Notification" in window ? Notification.permission : "no-soportado";

export interface DatosSuscripcion {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function registro(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) throw new Error("Los avisos solo funcionan en la app publicada (merviri.github.io).");
  return reg;
}

function mismaClave(sub: PushSubscription): boolean {
  const k = sub.options?.applicationServerKey;
  return !k || aBase64Url(new Uint8Array(k as ArrayBuffer)) === VAPID_PUBLICA;
}

function datos(sub: PushSubscription): DatosSuscripcion {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("El navegador no ha dado una suscripción completa.");
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}

/** Pide permiso (si hace falta) y se suscribe. Debe llamarse desde un toque del usuario. */
export async function suscribirse(): Promise<DatosSuscripcion> {
  if (!avisosSoportados()) throw new Error("Este navegador no admite avisos.");
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error(permiso === "denied"
      ? "Los avisos están bloqueados. En Chrome: ⋮ → Información del sitio → Notificaciones → Permitir."
      : "No se han activado los avisos.");
  }
  return suscripcionActual(true) as Promise<DatosSuscripcion>;
}

/** La suscripción de este navegador; si `crear`, la crea (o la rehace si la clave cambió). */
export async function suscripcionActual(crear = false): Promise<DatosSuscripcion | null> {
  if (!avisosSoportados() || Notification.permission !== "granted") return null;
  const reg = await registro();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !mismaClave(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub && crear) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desdeBase64Url(VAPID_PUBLICA) });
  }
  return sub ? datos(sub) : null;
}

export async function desuscribirse(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}
