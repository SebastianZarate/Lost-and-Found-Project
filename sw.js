
const NOMBRE_CACHE = 'lost-and-found-v1';
const RECURSOS_ESTATICOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/constants.js',
  './js/db.js',
  './js/imagen.js',
  './js/notificaciones.js',
  './js/utils.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './manifest.json'

];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(NOMBRE_CACHE)
      .then((cache) => cache.addAll(RECURSOS_ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombresCache) => {
        return Promise.all(
          nombresCache.map((nombre) => {
            if (nombre !== NOMBRE_CACHE) {
              return caches.delete(nombre);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  if (request.method !== 'GET') return;
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) return;

  evento.respondWith(
    caches.match(request).then((respuestaCache) => {
      if (respuestaCache) {
        return respuestaCache;
      }
      return fetch(request)
        .then((respuestaRed) => {
          if (
            !respuestaRed ||
            respuestaRed.status !== 200 ||
            (respuestaRed.type !== 'basic' && respuestaRed.type !== 'cors')
          ) {
            return respuestaRed;
          }
          const respuestaACachear = respuestaRed.clone();
          caches.open(NOMBRE_CACHE).then((cache) => {
            cache.put(request, respuestaACachear);
          });

          return respuestaRed;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
