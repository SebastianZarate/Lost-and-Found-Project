export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  try {
    const ruta = new URL('../sw.js', import.meta.url);
    const registro = await navigator.serviceWorker.register(ruta);
    console.info('[PWA] Service Worker registrado. Alcance:', registro.scope);
    return registro;
  } catch (error) {
    console.error('[PWA] No se pudo registrar el Service Worker:', error);
    return null;
  }
}
