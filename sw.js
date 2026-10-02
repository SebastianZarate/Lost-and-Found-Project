const CACHE_NAME = 'atlas3d-v2';
const CACHE_PREFIX = 'atlas3d-';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

const ICON_ASSETS = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

async function guardarIconos(cache) {
  for (const url of ICON_ASSETS) {
    const respuesta = await fetch(url);
    if (respuesta.ok) await cache.put(url, respuesta);
  }
}

async function cacheFirst(peticion) {
  const enCache = await caches.match(peticion);
  if (enCache) return enCache;

  const respuesta = await fetch(peticion);
  if (respuesta.ok) {
    const copia = respuesta.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
  }
  return respuesta;
}

async function networkFirst(peticion) {
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.ok) {
      const copia = respuesta.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
    }
    return respuesta;
  } catch {
    const enCache = await caches.match(peticion);
    if (enCache) return enCache;
    throw new Error('La red no está disponible y no hay respuesta en caché.');
  }
}

async function staleWhileRevalidate(peticion) {
  const enCache = await caches.match(peticion);
  const actualizar = fetch(peticion).then((respuesta) => {
    if (respuesta.ok) {
      const copia = respuesta.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(peticion, copia));
    }
    return respuesta;
  });

  return enCache || actualizar;
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CORE_ASSETS);
        await guardarIconos(cache);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres
          .filter((nombre) => nombre.startsWith(CACHE_PREFIX) && nombre !== CACHE_NAME)
          .map((nombre) => caches.delete(nombre)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const esModelo3D = /\.(glb|gltf|bin)$/i.test(url.pathname)
    || url.pathname.includes('/modelos-3d/')
    || url.pathname.includes('/models/');

  if (url.pathname.includes('/icons/') || esModelo3D) {
    evento.respondWith(cacheFirst(request));
  } else if (url.pathname.includes('/api/')) {
    evento.respondWith(networkFirst(request));
  } else {
    evento.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if ('focus' in ventana) return ventana.focus();
      }
      return self.clients.openWindow('./index.html');
    }),
  );
});
