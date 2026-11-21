import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const carpetaDatos = join(raiz, 'datos');
mkdirSync(carpetaDatos, { recursive: true });

const conexion = new Database(join(carpetaDatos, 'organizador.sqlite'));
conexion.pragma('journal_mode = WAL');
conexion.pragma('foreign_keys = ON');

conexion.exec(`
  CREATE TABLE IF NOT EXISTS objetos (
    clave TEXT PRIMARY KEY,
    id_local INTEGER,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    ubicacion TEXT NOT NULL,
    notas TEXT NOT NULL DEFAULT '',
    coordenadas TEXT,
    historial TEXT NOT NULL DEFAULT '[]',
    recordatorio INTEGER,
    recordatorio_notificado INTEGER NOT NULL DEFAULT 0,
    creado_en INTEGER NOT NULL,
    actualizado_en INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suscripciones (
    endpoint TEXT PRIMARY KEY,
    suscripcion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cambios_procesados (
    id_cambio TEXT PRIMARY KEY,
    procesado_en INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_objetos_actualizado
    ON objetos(actualizado_en DESC);
`);

const preparadas = {
  contarObjetos: conexion.prepare('SELECT COUNT(*) AS total FROM objetos'),
  obtenerSuscripciones: conexion.prepare('SELECT suscripcion FROM suscripciones'),
  guardarSuscripcion: conexion.prepare(`
    INSERT OR IGNORE INTO suscripciones (endpoint, suscripcion) VALUES (?, ?)
  `),
  eliminarSuscripcion: conexion.prepare(
    'DELETE FROM suscripciones WHERE endpoint = ?'
  ),
  cambioProcesado: conexion.prepare(
    'SELECT 1 FROM cambios_procesados WHERE id_cambio = ?'
  ),
  marcarCambio: conexion.prepare(`
    INSERT OR IGNORE INTO cambios_procesados (id_cambio, procesado_en) VALUES (?, ?)
  `),
  obtenerObjeto: conexion.prepare(
    'SELECT actualizado_en FROM objetos WHERE clave = ?'
  ),
  guardarObjeto: conexion.prepare(`
    INSERT INTO objetos (
      clave, id_local, nombre, categoria, ubicacion, notas, coordenadas,
      historial, recordatorio, recordatorio_notificado, creado_en, actualizado_en
    ) VALUES (
      @clave, @id_local, @nombre, @categoria, @ubicacion, @notas, @coordenadas,
      @historial, @recordatorio, @recordatorio_notificado, @creado_en, @actualizado_en
    )
    ON CONFLICT(clave) DO UPDATE SET
      id_local = excluded.id_local,
      nombre = excluded.nombre,
      categoria = excluded.categoria,
      ubicacion = excluded.ubicacion,
      notas = excluded.notas,
      coordenadas = excluded.coordenadas,
      historial = excluded.historial,
      recordatorio = excluded.recordatorio,
      recordatorio_notificado = excluded.recordatorio_notificado,
      creado_en = excluded.creado_en,
      actualizado_en = excluded.actualizado_en
  `),
  eliminarObjeto: conexion.prepare('DELETE FROM objetos WHERE clave = ?'),
  listarObjetos: conexion.prepare(`
    SELECT clave, id_local, nombre, categoria, ubicacion, notas, coordenadas,
           historial, recordatorio, recordatorio_notificado, creado_en, actualizado_en
    FROM objetos
    ORDER BY actualizado_en DESC
  `),
};

function convertirObjeto(fila) {
  return {
    claveSincronizacion: fila.clave,
    id: fila.id_local,
    nombre: fila.nombre,
    categoria: fila.categoria,
    ubicacion: fila.ubicacion,
    notas: fila.notas,
    coordenadas: fila.coordenadas ? JSON.parse(fila.coordenadas) : null,
    historial: JSON.parse(fila.historial),
    recordatorio: fila.recordatorio,
    recordatorioNotificado: Boolean(fila.recordatorio_notificado),
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en,
  };
}

export function obtenerSuscripciones() {
  return preparadas.obtenerSuscripciones.all()
    .map((fila) => JSON.parse(fila.suscripcion));
}

export function guardarSuscripcion(suscripcion) {
  preparadas.guardarSuscripcion.run(
    suscripcion.endpoint,
    JSON.stringify(suscripcion)
  );
}

export function eliminarSuscripcion(endpoint) {
  preparadas.eliminarSuscripcion.run(endpoint);
}

export function listarObjetos() {
  return preparadas.listarObjetos.all().map(convertirObjeto);
}

export function procesarCambio(cambio) {
  if (!cambio?.idCambio) {
    throw new Error('El cambio debe incluir idCambio');
  }

  if (preparadas.cambioProcesado.get(cambio.idCambio)) {
    return { duplicado: true };
  }

  const ejecutar = conexion.transaction(() => {
    const datos = cambio.datos ?? {};

    if (cambio.tipo === 'eliminar-objeto') {
      if (datos.claveSincronizacion) {
        preparadas.eliminarObjeto.run(datos.claveSincronizacion);
      }
    } else if (cambio.tipo === 'guardar-objeto' || cambio.tipo === 'mover-objeto') {
      const clave = datos.claveSincronizacion ||
        (datos.id != null ? `objeto-local-${datos.id}` : cambio.idCambio);
      const actualizadoEn = datos.actualizadoEn || Date.now();
      const existente = preparadas.obtenerObjeto.get(clave);

      if (!existente || actualizadoEn >= existente.actualizado_en) {
        preparadas.guardarObjeto.run({
          clave,
          id_local: datos.id ?? null,
          nombre: String(datos.nombre ?? '').trim(),
          categoria: String(datos.categoria ?? 'Otros'),
          ubicacion: String(datos.ubicacion ?? datos.nuevaUbicacion ?? '').trim(),
          notas: String(datos.notas ?? ''),
          coordenadas: datos.coordenadas ? JSON.stringify(datos.coordenadas) : null,
          historial: JSON.stringify(datos.historial ?? []),
          recordatorio: datos.recordatorio ?? null,
          recordatorio_notificado: datos.recordatorioNotificado ? 1 : 0,
          creado_en: datos.creadoEn ?? actualizadoEn,
          actualizado_en: actualizadoEn,
        });
      }
    }

    preparadas.marcarCambio.run(cambio.idCambio, Date.now());
  });

  ejecutar();
  return { duplicado: false };
}

export function cerrarBaseDatos() {
  conexion.close();
}

export function semillarDatosDemostracion() {
  if (preparadas.contarObjetos.get().total !== 0) return;

  const ahora = Date.now();
  const muestras = [
    ['demostracion-pasaporte', 'Pasaporte', 'Documentos', 'Portafolio azul del cajón superior', 'Se guarda junto con otros documentos de viaje.', 72],
    ['demostracion-celular', 'Celular', 'Electrónica', 'Mesa de noche', 'Cargador incluido en el soporte lateral.', 3],
    ['demostracion-llaves-casa', 'Llaves de la casa', 'Llaves', 'Bandeja junto a la puerta', 'Incluye llave principal y llavero rojo.', 9],
    ['demostracion-audifonos', 'Audífonos', 'Electrónica', 'Bolso pequeño de trabajo', 'Se guardan en su estuche negro.', 18],
    ['demostracion-carnet', 'Carné estudiantil', 'Documentos', 'Bolso de clase', 'Se usa para ingreso y préstamo de equipos.', 27],
    ['demostracion-chaqueta', 'Chaqueta azul', 'Ropa', 'Perchero del dormitorio', 'Guardada en el bolsillo interior derecho.', 36],
    ['demostracion-cargador', 'Cargador portátil', 'Accesorios', 'Compartimiento de la maleta', 'Se lleva para viajes y jornadas largas.', 48],
    ['demostracion-usb', 'Memoria USB', 'Electrónica', 'Cajón del escritorio', 'Etiqueta verde con respaldo del proyecto.', 60],
  ];

  const ejecutar = conexion.transaction(() => {
    for (const [clave, nombre, categoria, ubicacion, notas, horas] of muestras) {
      const actualizadoEn = ahora - (horas * 60 * 60 * 1000);
      preparadas.guardarObjeto.run({
        clave,
        id_local: null,
        nombre,
        categoria,
        ubicacion,
        notas,
        coordenadas: null,
        historial: JSON.stringify([{ ubicacion, fecha: actualizadoEn, coordenadas: null }]),
        recordatorio: null,
        recordatorio_notificado: 0,
        creado_en: actualizadoEn,
        actualizado_en: actualizadoEn,
      });
    }
  });

  ejecutar();
}

function migrarJsonAnterior() {
  const archivo = join(raiz, 'servidor-datos.json');
  if (!existsSync(archivo)) return;

  try {
    const datos = JSON.parse(readFileSync(archivo, 'utf8'));
    for (const suscripcion of datos.suscripciones ?? []) {
      guardarSuscripcion(suscripcion);
    }
  } catch (error) {
    console.warn('No se pudo migrar servidor-datos.json:', error.message);
  }
}

migrarJsonAnterior();
semillarDatosDemostracion();
