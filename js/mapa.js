import '../vendor/leaflet/leaflet.js';

const L = window.L;
const VISTA_INICIAL = [5.5353, -73.3678];
const ZOOM_INICIAL = 13;

export function crearMapa(elemento, alSeleccionar) {
  if (!L || !elemento) return null;

  const mapa = L.map(elemento, { zoomControl: true }).setView(VISTA_INICIAL, ZOOM_INICIAL);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(mapa);

  let marcador = null;
  mapa.on('click', (evento) => {
    marcador = marcador
      ? marcador.setLatLng(evento.latlng)
      : L.marker(evento.latlng).addTo(mapa);
    alSeleccionar({ latitud: evento.latlng.lat, longitud: evento.latlng.lng, precision: null });
  });

  return {
    mapa,
    colocar(coordenadas) {
      if (!coordenadas) return;
      const punto = [coordenadas.latitud, coordenadas.longitud];
      mapa.setView(punto, 16);
      marcador = marcador
        ? marcador.setLatLng(punto)
        : L.marker(punto).addTo(mapa);
    },
    destruir() {
      mapa.remove();
    },
  };
}
