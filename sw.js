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
precacheAndRoute([{"revision":"28bc3c70c2b0e2b665df2f1743fab23c","url":"index.html"},{"revision":"33d855c76be489025daad689dce3cf2d","url":"manifest.json"},{"revision":"1d2d82635508defb90e5d81b05fb36f9","url":"css/styles.css"},{"revision":"8b30be61d8124605daf2505c58da1349","url":"js/utils.js"},{"revision":"e31df2f9cffaef5693c1ce54cfb38d2e","url":"js/sync.js"},{"revision":"22fac8712126ead57d22d30768e86615","url":"js/servidor.js"},{"revision":"5505d858edc84c2e25c9e26f3cac819a","url":"js/pwa.js"},{"revision":"da53b3dc6087983f856fcc84f0e2d1d4","url":"js/notificaciones.js"},{"revision":"18d3ebd3f34398fd2763c70ef3c660b5","url":"js/mapa.js"},{"revision":"3e771289a80daa78d17b8b7ce17cde91","url":"js/imagen.js"},{"revision":"46f8639a02583027fc35dd5e427e7a5a","url":"js/dispositivo.js"},{"revision":"ea46453d36e3485bbe352787b0eb470f","url":"js/db.js"},{"revision":"d8abe4904cabbe4e343b26e3a8cd90b1","url":"js/constants.js"},{"revision":"e03af2b27567ef245dc88f478be9fc86","url":"js/base-datos.js"},{"revision":"8503452d3f2d610646a470378c3ee8a5","url":"js/app.js"},{"revision":"f7a3fe98f3eb12ae0e6cff8019a0a672","url":"vendor/leaflet/leaflet.js"},{"revision":"c02c12fe5e21d2493070649584ca38b7","url":"vendor/leaflet/leaflet.css"},{"revision":"44a526eed258222515aa21eaffd14a96","url":"vendor/leaflet/images/marker-shadow.png"},{"revision":"2273e3d8ad9264b7daa5bdbf8e6b47f8","url":"vendor/leaflet/images/marker-icon.png"},{"revision":"401d815dc206b8dc1b17cd0e37695975","url":"vendor/leaflet/images/marker-icon-2x.png"},{"revision":"a6137456ed160d7606981aa57c559898","url":"vendor/leaflet/images/layers.png"},{"revision":"4f0283c6ce28e888000e978e537a6a56","url":"vendor/leaflet/images/layers-2x.png"},{"revision":"604e6c9158437913b310e93219c5c1b3","url":"icons/icon-maskable-512.png"},{"revision":"060177290b6a3805e1398eec2d644f30","url":"icons/icon-512.png"},{"revision":"eed1439f74dea1ec36888831162809af","url":"icons/icon-192.png"},{"revision":"70cddd29295173c3384dddb4be46d70a","url":"app/manifest.json"},{"revision":"f2245983e11dcbdd1772b44759753558","url":"app/index.html"},{"revision":"af674632f679864646b4045d1af8b58b","url":"app/assets/index-CSATXLPo.js"},{"revision":"f96dd9eb8213c0d352f843b12fda5384","url":"app/assets/index-C7EUHAJI.css"},{"revision":"eed1439f74dea1ec36888831162809af","url":"app/assets/icon-192-BR7uAetM.png"}]);

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
