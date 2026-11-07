/*
 * Service worker de Merviri: guarda la app para que se abra sin conexión.
 * Solo toca ficheros de la propia app. Nunca guarda ni intercepta las
 * llamadas a la API de GitHub (ahí van los datos y el token).
 */
const CACHE = "merviri-app-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icono.svg", "/logo.svg", "/icon-192.png", "/badge-96.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// La página avisa de los ficheros que ha cargado para guardarlos ya en la primera visita.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "cache-urls" || !Array.isArray(event.data.urls)) return;
  const same = event.data.urls.filter((u) => {
    try { return new URL(u).origin === self.location.origin; } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(same)).catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // version.json siempre de la red: sirve para avisar de versiones nuevas.
  if (url.pathname === "/version.json") return;

  if (req.mode === "navigate") {
    // Página: primero la red (para recibir versiones nuevas); sin red, la guardada.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }
  // Ficheros con nombre versionado: primero la caché.
  event.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});

// ---------------------------------------------------------------------------
// Avisos (Web Push). El contenido llega cifrado para este móvil; el
// navegador lo descifra y aquí solo se muestra.
// ---------------------------------------------------------------------------

const rutaSegura = (r) => (typeof r === "string" && /^[a-z0-9/_-]{1,80}$/i.test(r) ? r : "inicio");

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  const titulo = typeof d.t === "string" && d.t ? d.t : "Merviri ✨";
  event.waitUntil(self.registration.showNotification(titulo, {
    body: typeof d.b === "string" ? d.b : "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: typeof d.e === "string" && d.e ? d.e : undefined,
    renotify: typeof d.e === "string" && d.e !== "",
    silent: d.s === 1,
    lang: "es",
    data: { ruta: rutaSegura(d.r) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(`/#${rutaSegura(event.notification.data?.ruta)}`, self.location.origin).href;
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of ventanas) {
      if (new URL(c.url).origin === self.location.origin) {
        await c.focus();
        return c.navigate(url).catch(() => undefined);
      }
    }
    return self.clients.openWindow(url);
  })());
});
