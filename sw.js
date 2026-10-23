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
precacheAndRoute([{"revision":"3c61ba3c6ca52baf52d048acc214c577","url":"index.html"},{"revision":"33d855c76be489025daad689dce3cf2d","url":"manifest.json"},{"revision":"d3dc1e490f042a0a95584526ca55eae3","url":"css/styles.css"},{"revision":"78155cfe51aeb7e42303df0c516e826c","url":"js/utils.js"},{"revision":"106f75f68737c3de5a4194a44308997f","url":"js/sync.js"},{"revision":"406d4ea3f6bd373296d9e6035c6290f2","url":"js/servidor.js"},{"revision":"6d48d1625b438c037fd8ff1f860a677c","url":"js/pwa.js"},{"revision":"8a65cefb6d4ca2b7952db5006e7a2083","url":"js/notificaciones.js"},{"revision":"18d3ebd3f34398fd2763c70ef3c660b5","url":"js/mapa.js"},{"revision":"b2c248b627c9a9a56f1dbf93b6df859e","url":"js/imagen.js"},{"revision":"46f8639a02583027fc35dd5e427e7a5a","url":"js/dispositivo.js"},{"revision":"67685dba0a516674f5d93c0c610fd422","url":"js/db.js"},{"revision":"b4339759196b230e41cf063ee586caad","url":"js/constants.js"},{"revision":"9c2e0c94c83562bc26559d8f4f6913c5","url":"js/app.js"},{"revision":"f7a3fe98f3eb12ae0e6cff8019a0a672","url":"vendor/leaflet/leaflet.js"},{"revision":"c02c12fe5e21d2493070649584ca38b7","url":"vendor/leaflet/leaflet.css"},{"revision":"44a526eed258222515aa21eaffd14a96","url":"vendor/leaflet/images/marker-shadow.png"},{"revision":"2273e3d8ad9264b7daa5bdbf8e6b47f8","url":"vendor/leaflet/images/marker-icon.png"},{"revision":"401d815dc206b8dc1b17cd0e37695975","url":"vendor/leaflet/images/marker-icon-2x.png"},{"revision":"a6137456ed160d7606981aa57c559898","url":"vendor/leaflet/images/layers.png"},{"revision":"4f0283c6ce28e888000e978e537a6a56","url":"vendor/leaflet/images/layers-2x.png"},{"revision":"604e6c9158437913b310e93219c5c1b3","url":"icons/icon-maskable-512.png"},{"revision":"060177290b6a3805e1398eec2d644f30","url":"icons/icon-512.png"},{"revision":"eed1439f74dea1ec36888831162809af","url":"icons/icon-192.png"}]);

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
