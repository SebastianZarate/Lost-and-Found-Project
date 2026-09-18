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
 *   historial: [{ ubicacion, fecha }],
 *   recordatorio: number | null,   // timestamp del aviso
 *   recordatorioNotificado: boolean,
 *   creadoEn: number,
 *   actualizadoEn: number
 * }
 */
import { normalizar } from './utils.js';
import { TODAS } from './constants.js';

const DB_NAME = 'organizador-objetos-db';
const DB_VERSION = 1;
const STORE = 'objetos';

let dbPromise = null;

/** Abre (o crea) la base de datos. Reutiliza la conexión una vez abierta. */
export function abrirDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(DB_NAME, DB_VERSION);

    // Se ejecuta solo cuando la BD se crea o cambia DB_VERSION.
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const almacen = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        almacen.createIndex('nombre', 'nombre');
        almacen.createIndex('categoria', 'categoria');
        almacen.createIndex('actualizadoEn', 'actualizadoEn');
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
export async function crearObjeto({ nombre, categoria, ubicacion, notas = '', foto = null, recordatorio = null }) {
  const ahora = Date.now();
  const objeto = {
    nombre: nombre.trim(),
    categoria,
    ubicacion: ubicacion.trim(),
    notas: notas.trim(),
    foto,
    historial: [{ ubicacion: ubicacion.trim(), fecha: ahora }],
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
    if (nuevaUbicacion !== actual.ubicacion) {
      historial.push({ ubicacion: nuevaUbicacion, fecha: ahora });
    }
    const cambioRecordatorio = (datos.recordatorio ?? null) !== actual.recordatorio;
    return {
      ...actual,
      nombre: datos.nombre.trim(),
      categoria: datos.categoria,
      ubicacion: nuevaUbicacion,
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
      historial: [...actual.historial, { ubicacion, fecha: ahora }],
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
