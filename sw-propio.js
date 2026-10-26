// sw-propio.js — Service Worker propio con InjectManifest (Sesión 26).
// Soporta precaché sin conexión, estrategias runtime, Notificaciones Push y Background Sync.

importScripts("lib/workbox-v7.4.1/workbox-sw.js");
workbox.setConfig({ modulePathPrefix: "lib/workbox-v7.4.1/", debug: false });

const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { registerRoute } = workbox.routing;
const { CacheFirst, NetworkFirst, StaleWhileRevalidate } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;

self.skipWaiting();
workbox.core.clientsClaim();
cleanupOutdatedCaches();

// Inyección del manifiesto generado por Workbox
precacheAndRoute(self.__WB_MANIFEST);

// Estrategias de caché en tiempo de ejecución
registerRoute(
  ({ url }) => url.pathname.startsWith("/icons/"),
  new CacheFirst({
    cacheName: "imagenes-iconos",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/vendor/leaflet/"),
  new CacheFirst({
    cacheName: "leaflet-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache",
  })
);

registerRoute(
  ({ request }) => ["document", "script", "style"].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: "shell",
  })
);

// ── Clic en la notificación ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url ?? "/index.html", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const ventanas = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (abierta) {
        if ("focus" in abierta) await abierta.focus();
        if (abierta.navigate && abierta.url !== destino) await abierta.navigate(destino);
        return;
      }
      if (clients.openWindow) return clients.openWindow(destino);
    })()
  );
});

// ── Evento Push (mensajes desde el servidor) ───────────────────────────────
self.addEventListener("push", (event) => {
  let datos = {
    titulo: "Organizador de Objetos",
    cuerpo: "Tienes una actualización de tus objetos.",
    url: "/index.html",
  };

  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    if (event.data) datos.cuerpo = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "es",
      dir: "auto",
      tag: datos.tag ?? "obj-perdido-aviso",
      data: { url: datos.url },
    })
  );
});

// ── Background Sync: vaciado de outbox y notificación inteligente ───────────
function abrirDB() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open("organizador-objetos-db");
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

function pedir(peticion) {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function vaciarBandeja() {
  const db = await abrirDB();
  if (!db.objectStoreNames.contains("outbox")) {
    db.close();
    return 0;
  }

  const txLectura = db.transaction("outbox", "readonly");
  const pendientes = await pedir(txLectura.objectStore("outbox").getAll());
  let enviados = 0;

  for (const cambio of pendientes) {
    const resp = await fetch("/api/objetos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambio),
    });

    if (!resp.ok) {
      throw new Error("El servidor respondió con código " + resp.status);
    }

    const txBorrado = db.transaction("outbox", "readwrite");
    await pedir(txBorrado.objectStore("outbox").delete(cambio.idCambio));
    enviados++;
  }

  db.close();
  return enviados;
}

async function avisarDeSincronizacion(enviados) {
  if (enviados <= 0) return;

  const ventanas = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const algunaVisible = ventanas.some((v) => v.visibilityState === "visible");

  for (const ventana of ventanas) {
    ventana.postMessage({ type: "SYNC_COMPLETADO", enviados });
  }

  if (!algunaVisible) {
    await self.registration.showNotification("Objetos sincronizados", {
      body: `${enviados} ${enviados === 1 ? "objeto sincronizado" : "objetos sincronizados"} con el servidor.`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "es",
      dir: "auto",
      tag: "obj-sync",
      data: { url: "/index.html" },
    });
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-objetos" || event.tag === "sync-tareas") {
    event.waitUntil(vaciarBandeja().then(avisarDeSincronizacion));
  }
});
