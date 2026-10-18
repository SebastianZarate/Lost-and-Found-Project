export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const ruta = new URL('../sw.js?v=20261018-1', import.meta.url);
    const registro = await navigator.serviceWorker.register(ruta);
    const activarActualizacion = () => {
      if (registro.waiting) registro.waiting.postMessage({ type: 'SKIP_WAITING' });
    };

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (sessionStorage.getItem('sw-recargado') === '1') return;
        sessionStorage.setItem('sw-recargado', '1');
        window.location.reload();
      }, { once: true });
    }

    activarActualizacion();
    registro.addEventListener('updatefound', () => {
      const trabajador = registro.installing;
      if (!trabajador) return;
      trabajador.addEventListener('statechange', () => {
        if (trabajador.state === 'installed') activarActualizacion();
      });
    });

    if (!navigator.serviceWorker.controller) {
      await navigator.serviceWorker.ready;
    }

    console.info('[PWA] Service Worker registrado. Alcance:', registro.scope);
    return registro;
  } catch (error) {
    console.error('[PWA] No se pudo registrar el Service Worker:', error);
    return null;
  }
}
