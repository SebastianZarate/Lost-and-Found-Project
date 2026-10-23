/**
 * notificaciones.js - Recordatorios y gestión de Notificaciones locales y Push API (Sesión 26).
 *
 * Combina la revisión en memoria de recordatorios con la API de Notificaciones,
 * el Service Worker y el protocolo Push VAPID.
 */

/**
 * Pide permiso para mostrar notificaciones.
 * Solo debe llamarse tras una interacción explícita del usuario.
 */
export async function pedirPermisoNotificaciones() {
  if (!("Notification" in window)) return "no-soportado";
  return Notification.requestPermission();
}

/**
 * Muestra una notificación local a través del Service Worker Registration.
 * Se prefiere showNotification() para evitar TypeError en Chrome en Android y
 * garantizar compatibilidad fuera de foco.
 */
export async function mostrarAvisoLocal(titulo, cuerpo, url = "/index.html") {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification(titulo, {
    body: cuerpo,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "obj-perdido-aviso",
    data: { url },
  });
}

/** Convierte una clave pública VAPID en Base64URL a Uint8Array binario. */
export function urlBase64ABytes(base64url) {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(b64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Suscribe el navegador a Push usando VAPID y registra la suscripción en el servidor. */
export async function suscribirAPush() {
  const reg = await navigator.serviceWorker.ready;
  if (!("pushManager" in reg)) throw new Error("push-no-soportado");

  const respClave = await fetch("/api/clave-publica");
  if (!respClave.ok) throw new Error("No se pudo obtener la clave pública del servidor");
  const { clave } = await respClave.json();

  const suscripcion = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ABytes(clave),
  });

  const resp = await fetch("/api/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(suscripcion.toJSON()),
  });

  if (!resp.ok) throw new Error("El servidor no guardó la suscripción (" + resp.status + ")");
  return suscripcion;
}

/** Cancela la suscripción push en el navegador y notifica al backend. */
export async function cancelarSuscripcionPush() {
  const reg = await navigator.serviceWorker.ready;
  if (!("pushManager" in reg)) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return false;

  try {
    await fetch("/api/desuscribir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch (err) {
    console.warn("No se pudo notificar la cancelación al servidor:", err);
  }

  return await sub.unsubscribe();
}

/** Obtiene la suscripción push activa si existe. */
export async function obtenerSuscripcionActual() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  if (!("pushManager" in reg)) return null;
  return await reg.pushManager.getSubscription();
}

/** Traduce excepciones de Push a mensajes comprensibles para el usuario. */
export function describirErrorPush(error) {
  if (!error) return "Error desconocido con el servicio push.";
  const nombre = error.name || "";
  const mensaje = error.message || "";
  if (nombre === "NotAllowedError") {
    return "Permiso denegado para notificaciones push en el navegador.";
  }
  if (nombre === "AbortError" || mensaje.includes("incognito") || mensaje.includes("Registration failed")) {
    return "El servicio de push del navegador no respondió (¿sin red, o navegador sin servicio de push?).";
  }
  if (mensaje === "push-no-soportado") {
    return "Este navegador no soporta PushManager.";
  }
  return `Error de push: ${error.message || nombre}`;
}

/** Envía un push de prueba invocando el endpoint del servidor. */
export async function enviarPushPrueba(
  titulo = "Organizador de Objetos",
  cuerpo = "Mensaje de prueba de push desde el servidor",
  url = "/index.html"
) {
  const resp = await fetch("/api/enviar-prueba", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titulo, cuerpo, url }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "El servidor respondió con código " + resp.status);
  }
  return await resp.json();
}

/**
 * Recorre los objetos y avisa de los recordatorios vencidos.
 * Muestra tanto aviso en UI como notificación del sistema si hay permiso.
 * @returns lista de objetos avisados.
 */
export async function revisarRecordatorios(objetos, alMarcar) {
  const ahora = Date.now();
  const vencidos = objetos.filter(
    (o) => o.recordatorio && !o.recordatorioNotificado && o.recordatorio <= ahora,
  );

  for (const objeto of vencidos) {
    await alMarcar(objeto.id);

    // Si tenemos permiso de notificación, mostramos aviso local del sistema
    if ("Notification" in window && Notification.permission === "granted") {
      mostrarAvisoLocal(
        `Recordatorio: ${objeto.nombre}`,
        `¿Sigue en «${objeto.ubicacion}»? Toca para verificar.`,
        `/index.html`
      ).catch(() => {});
    }
  }

  return vencidos;
}
