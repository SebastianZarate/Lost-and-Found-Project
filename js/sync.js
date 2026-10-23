/**
 * sync.js - Gestión de la bandeja de salida (outbox) y Background Sync (Sesión 26).
 *
 * Implementa el patrón outbox, resiliencia offline, reintentos idempotentes y
 * Plan B para navegadores que no soportan la SyncManager API.
 */

export const ETIQUETA_SYNC = "sync-objetos";

/** Comprueba si el navegador soporta Background Synchronization. */
export function haySyncEnSegundoPlano() {
  return "serviceWorker" in navigator && "SyncManager" in window;
}

/** Anota un cambio pendiente en outbox con un UUID único. */
export function encolarCambio(db, tipo, datos) {
  const cambio = {
    idCambio: crypto.randomUUID(),
    tipo,
    datos,
    creadoEn: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").add(cambio);
    tx.oncomplete = () => resolve(cambio.idCambio);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Devuelve la lista completa de cambios pendientes en outbox. */
export function obtenerCambiosPendientes(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const peticion = tx.objectStore("outbox").getAll();
    peticion.onsuccess = () => resolve(peticion.result || []);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Cuenta el número de cambios pendientes en outbox. */
export function contarCambiosPendientes(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const peticion = tx.objectStore("outbox").count();
    peticion.onsuccess = () => resolve(peticion.result || 0);
    peticion.onerror = () => reject(peticion.error);
  });
}

/** Elimina un cambio de outbox tras confirmación del servidor. */
export function eliminarCambioOutbox(db, idCambio) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    const peticion = tx.objectStore("outbox").delete(idCambio);
    peticion.onsuccess = () => resolve();
    peticion.onerror = () => reject(peticion.error);
  });
}

/**
 * Plan B: Sincroniza desde la página cuando no existe SyncManager (Safari/Firefox)
 * o cuando el usuario bloqueó el permiso de sincronización en segundo plano.
 */
export async function vaciarDesdeLaPagina(db) {
  const pendientes = await obtenerCambiosPendientes(db);
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

    // Se borra cada entrada inmediatamente al confirmarse
    await eliminarCambioOutbox(db, cambio.idCambio);
    enviados++;
  }

  return enviados;
}

/**
 * Solicita la sincronización al navegador (Background Sync) o ejecuta Plan B.
 */
export async function pedirSincronizacion(db) {
  if (haySyncEnSegundoPlano()) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register(ETIQUETA_SYNC);
      return "segundo-plano";
    } catch (err) {
      console.warn("Fallo en reg.sync.register, ejecutando Plan B:", err);
    }
  }

  // Plan B: Vaciar desde la página
  await vaciarDesdeLaPagina(db);
  return "desde-la-pagina";
}
