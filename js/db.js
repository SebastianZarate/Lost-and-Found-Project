/**
 * db.js - Capa de acceso a IndexedDB.
 *
 * Es el único archivo que "conoce" IndexedDB. El resto de la app usa las
 * funciones exportadas aquí (crear, listar, editar, mover, eliminar, buscar).
 * Esto permite cambiar el almacenamiento en el futuro sin tocar la interfaz.
 *
 * Modelo de un objeto guardado:
 * {
 *   id: number,                    // autoincremental
 *   nombre: string,
 *   categoria: string,             // una de CATEGORIAS
 *   ubicacion: string,             // última ubicación registrada
 *   notas: string,
 *   foto: Blob | null,             // IndexedDB guarda Blobs directamente
 *   coordenadas: { latitud, longitud, precision } | null,
 *   historial: [{ ubicacion, fecha, coordenadas? }],
 *   recordatorio: number | null,   // timestamp del aviso
 *   recordatorioNotificado: boolean,
 *   creadoEn: number,
 *   actualizadoEn: number
 * }
 */
import { normalizar } from './utils.js';
import { TODAS } from './constants.js';

const DB_NAME = 'organizador-objetos-db';
const DB_VERSION = 5;
const STORE = 'objetos';

let dbPromise = null;

/** Abre (o crea) la base de datos. Reutiliza la conexión una vez abierta. */
export function abrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NAME, DB_VERSION);

    // Se ejecuta solo cuando la BD se crea o cambia DB_VERSION.
    peticion.onupgradeneeded = (evento) => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const almacen = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        almacen.createIndex('nombre', 'nombre');
        almacen.createIndex('categoria', 'categoria');
        almacen.createIndex('actualizadoEn', 'actualizadoEn');
        almacen.createIndex('claveSincronizacion', 'claveSincronizacion', { unique: true });
      } else if (!peticion.transaction.objectStore(STORE).indexNames.contains('claveSincronizacion')) {
        peticion.transaction.objectStore(STORE).createIndex(
          'claveSincronizacion',
          'claveSincronizacion',
          { unique: true }
        );
      }

      if (evento.oldVersion < 4) {
        const almacen = peticion.transaction.objectStore(STORE);
        almacen.openCursor().onsuccess = (cursorEvento) => {
          const cursor = cursorEvento.target.result;
          if (!cursor) return;
          const objeto = cursor.value;
          if (!objeto.claveSincronizacion) {
            cursor.update({ ...objeto, claveSincronizacion: crypto.randomUUID() });
          }
          cursor.continue();
        };
      }

      if (evento.oldVersion < 2) {
        const almacen = peticion.transaction.objectStore(STORE);
        almacen.openCursor().onsuccess = (cursorEvento) => {
          const cursor = cursorEvento.target.result;
          if (!cursor) return;
          const objeto = cursor.value;
          const coordenadas = objeto.coordenadas ?? null;
          const historial = (objeto.historial ?? []).map((entrada) => ({
            ...entrada,
            coordenadas: entrada.coordenadas ?? null,
          }));
          cursor.update({ ...objeto, coordenadas, historial });
          cursor.continue();
        };
      }

      if (!db.objectStoreNames.contains('configuracion')) {
        db.createObjectStore('configuracion', { keyPath: 'clave' });
      }

      // Sesión 26: Bandeja de salida (outbox) para Background Sync
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'idCambio' });
      }
    };

    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => {
      dbPromise = null;
      reject(peticion.error);
    };
  });

  return dbPromise;
}

/** Ejecuta una operación simple sobre el almacén dentro de una transacción. */
async function ejecutar(modo, operacion) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const transaccion = db.transaction(STORE, modo);
    const almacen = transaccion.objectStore(STORE);
    let resultado;
    const peticion = operacion(almacen);
    peticion.onsuccess = () => { resultado = peticion.result; };
    transaccion.oncomplete = () => resolve(resultado);
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error);
  });
}

/** Lee un objeto, lo transforma con `transformar` y lo guarda (todo en 1 transacción). */
async function modificar(id, transformar) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const transaccion = db.transaction(STORE, 'readwrite');
    const almacen = transaccion.objectStore(STORE);
    const lectura = almacen.get(id);
    let actualizado;

    lectura.onsuccess = () => {
      const actual = lectura.result;
      if (!actual) {
        transaccion.abort();
        reject(new Error(`No existe el objeto con id ${id}`));
        return;
      }
      actualizado = transformar(actual);
      almacen.put(actualizado);
    };

    transaccion.oncomplete = () => resolve(actualizado);
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error);
  });
}

/* ------------------------------ CRUD ------------------------------ */

/** CREATE: registra un objeto nuevo. */
export async function crearObjeto({
  nombre, categoria, ubicacion, notas = '', foto = null, recordatorio = null, coordenadas = null,
}) {
  const ahora = Date.now();
  const objeto = {
    claveSincronizacion: crypto.randomUUID(),
    nombre: nombre.trim(),
    categoria,
    ubicacion: ubicacion.trim(),
    coordenadas,
    notas: notas.trim(),
    foto,
    historial: [{ ubicacion: ubicacion.trim(), fecha: ahora, coordenadas }],
    recordatorio,
    recordatorioNotificado: false,
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
  const id = await ejecutar('readwrite', (almacen) => almacen.add(objeto));
  return { ...objeto, id };
}

/** READ: un objeto por id. */
export function obtenerObjeto(id) {
  return ejecutar('readonly', (almacen) => almacen.get(id));
}

/** READ: todos los objetos, del más reciente al más antiguo. */
export async function listarObjetos() {
  const todos = await ejecutar('readonly', (almacen) => almacen.getAll());
  return todos.sort((a, b) => b.actualizadoEn - a.actualizadoEn);
}

/** UPDATE: edita los datos de un objeto. Si cambia la ubicación, la agrega al historial. */
export function editarObjeto(id, datos) {
  return modificar(id, (actual) => {
    const ahora = Date.now();
    const nuevaUbicacion = datos.ubicacion.trim();
    const historial = [...actual.historial];
    const nuevasCoordenadas = datos.coordenadas ?? null;
    const cambioCoordenadas = JSON.stringify(nuevasCoordenadas) !== JSON.stringify(actual.coordenadas ?? null);
    if (nuevaUbicacion !== actual.ubicacion || cambioCoordenadas) {
      historial.push({ ubicacion: nuevaUbicacion, fecha: ahora, coordenadas: nuevasCoordenadas });
    }
    const cambioRecordatorio = (datos.recordatorio ?? null) !== actual.recordatorio;
    return {
      ...actual,
      nombre: datos.nombre.trim(),
      categoria: datos.categoria,
      ubicacion: nuevaUbicacion,
      coordenadas: nuevasCoordenadas,
      notas: (datos.notas ?? '').trim(),
      foto: datos.foto ?? null,
      historial,
      recordatorio: datos.recordatorio ?? null,
      recordatorioNotificado: cambioRecordatorio ? false : actual.recordatorioNotificado,
      actualizadoEn: ahora,
    };
  });
}

/** UPDATE rápido: solo cambia la ubicación (funcionalidad "Actualización de ubicación"). */
export function moverObjeto(id, nuevaUbicacion) {
  return modificar(id, (actual) => {
    const ahora = Date.now();
    const ubicacion = nuevaUbicacion.trim();
    return {
      ...actual,
      ubicacion,
      coordenadas: null,
      historial: [...actual.historial, { ubicacion, fecha: ahora, coordenadas: null }],
      actualizadoEn: ahora,
    };
  });
}

/** Marca que el recordatorio ya se avisó, para no repetirlo. */
export function marcarRecordatorioNotificado(id) {
  return modificar(id, (actual) => ({ ...actual, recordatorioNotificado: true }));
}

/** DELETE: elimina un objeto. */
export function eliminarObjeto(id) {
  return ejecutar('readwrite', (almacen) => almacen.delete(id));
}

/** Fusiona la copia del servidor sin borrar datos locales más nuevos. */
export async function fusionarObjetosRemotos(objetosRemotos = []) {
  const db = await abrirDB();
  const locales = await ejecutar('readonly', (almacen) => almacen.getAll());
  const porClave = new Map(
    locales
      .filter((objeto) => objeto.claveSincronizacion)
      .map((objeto) => [objeto.claveSincronizacion, objeto])
  );

  return new Promise((resolve, reject) => {
    const transaccion = db.transaction(STORE, 'readwrite');
    const almacen = transaccion.objectStore(STORE);

    for (const remoto of objetosRemotos) {
      if (!remoto?.claveSincronizacion) continue;
      const local = porClave.get(remoto.claveSincronizacion);
      if (!local || (remoto.actualizadoEn || 0) > (local.actualizadoEn || 0)) {
        almacen.put({
          ...remoto,
          id: local?.id ?? remoto.id,
          foto: local?.foto ?? null,
        });
      }
    }

    transaccion.oncomplete = () => resolve();
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error);
  });
}

/** Registra una muestra inicial solo la primera vez que la base está vacía. */
export async function inicializarDatosDemostracion() {
  const db = await abrirDB();
  if (!db.objectStoreNames.contains('configuracion')) return;

  const ahora = Date.now();
  const antiguedad = (horas) => ahora - (horas * 60 * 60 * 1000);
  const muestras = [
    ['demostracion-pasaporte', 'Pasaporte', 'Documentos', 'Portafolio azul del cajón superior', 'Se guarda junto con otros documentos de viaje.'],
    ['demostracion-celular', 'Celular', 'Electrónica', 'Mesa de noche', 'Cargador incluido en el soporte lateral.'],
    ['demostracion-llaves-casa', 'Llaves de la casa', 'Llaves', 'Bandeja junto a la puerta', 'Incluye llave principal y llavero rojo.'],
    ['demostracion-audifonos', 'Audífonos', 'Electrónica', 'Bolso pequeño de trabajo', 'Se guardan en su estuche negro.'],
    ['demostracion-carnet', 'Carné estudiantil', 'Documentos', 'Bolso de clase', 'Se usa para ingreso y préstamo de equipos.'],
    ['demostracion-chaqueta', 'Chaqueta azul', 'Ropa', 'Perchero del dormitorio', 'Guardada en el bolsillo interior derecho.'],
    ['demostracion-cargador', 'Cargador portátil', 'Accesorios', 'Compartimiento de la maleta', 'Se lleva para viajes y jornadas largas.'],
    ['demostracion-usb', 'Memoria USB', 'Electrónica', 'Cajón del escritorio', 'Etiqueta verde con respaldo del proyecto.'],
  ];

  return new Promise((resolve, reject) => {
    const transaccion = db.transaction([STORE, 'configuracion'], 'readwrite');
    const almacenObjetos = transaccion.objectStore(STORE);
    const almacenConfiguracion = transaccion.objectStore('configuracion');
    const marcador = almacenConfiguracion.get('datos-demostracion-inicializados');
    const conteo = almacenObjetos.count();

    marcador.onsuccess = () => {
      if (marcador.result) return;

      conteo.onsuccess = () => {
        if (conteo.result !== 0) {
          almacenConfiguracion.put({
            clave: 'datos-demostracion-inicializados',
            valor: true,
            fecha: ahora,
          });
          return;
        }

        muestras.forEach((muestra, indice) => {
          const [claveSincronizacion, nombre, categoria, ubicacion, notas] = muestra;
          const actualizadoEn = antiguedad((indice + 1) * 3);
          const creadoEn = antiguedad((indice + 1) * 24);
          almacenObjetos.add({
            claveSincronizacion,
            nombre,
            categoria,
            ubicacion,
            notas,
            coordenadas: null,
            foto: null,
            historial: [{ ubicacion, fecha: creadoEn, coordenadas: null }],
            recordatorio: null,
            recordatorioNotificado: false,
            creadoEn,
            actualizadoEn,
          });
        });

        almacenConfiguracion.put({
          clave: 'datos-demostracion-inicializados',
          valor: true,
          fecha: ahora,
        });
      };
    };

    transaccion.oncomplete = () => resolve();
    transaccion.onerror = () => reject(transaccion.error);
    transaccion.onabort = () => reject(transaccion.error);
  });
}

/* ----------------------------- Búsqueda ----------------------------- */

/**
 * Filtra una lista de objetos por texto (nombre, categoría, ubicación y notas)
 * y por categoría. Es una función pura: recibe datos y devuelve datos.
 */
export function filtrarObjetos(objetos, { texto = '', categoria = TODAS } = {}) {
  const consulta = normalizar(texto);
  return objetos.filter((o) => {
    if (categoria !== TODAS && o.categoria !== categoria) return false;
    if (!consulta) return true;
    const pajar = normalizar(`${o.nombre} ${o.categoria} ${o.ubicacion} ${o.notas}`);
    return consulta.split(/\s+/).every((palabra) => pajar.includes(palabra));
  });
}
