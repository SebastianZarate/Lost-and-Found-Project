// js/servidor.js — Servidor Node para Organizador de Objetos Perdidos (Sesión 26).
// Sirve la PWA, gestiona suscripciones Web Push con VAPID y recibe sincronizaciones outbox.

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const puerto = Number(process.env.PORT || 5500);

const ARCHIVO_CLAVES = join(raiz, 'claves-vapid.json');
const ARCHIVO_DATOS = join(raiz, 'servidor-datos.json');

// ── Claves VAPID ───────────────────────────────────────────────────────────
let claves;
if (existsSync(ARCHIVO_CLAVES)) {
  claves = JSON.parse(readFileSync(ARCHIVO_CLAVES, 'utf8'));
} else {
  claves = webpush.generateVAPIDKeys();
  writeFileSync(ARCHIVO_CLAVES, JSON.stringify(claves, null, 2));
  console.log('Claves VAPID generadas en claves-vapid.json');
}

webpush.setVapidDetails(
  'mailto:contacto@organizador-objetos.local',
  claves.publicKey,
  claves.privateKey
);

// ── Datos persistentes del servidor ─────────────────────────────────────────
function cargarDatos() {
  if (existsSync(ARCHIVO_DATOS)) {
    try {
      return JSON.parse(readFileSync(ARCHIVO_DATOS, 'utf8'));
    } catch {
      return { suscripciones: [], objetos: [] };
    }
  }
  return { suscripciones: [], objetos: [] };
}

let datosServidor = cargarDatos();

async function guardarDatos(nuevosDatos) {
  datosServidor = nuevosDatos;
  await writeFile(ARCHIVO_DATOS, JSON.stringify(datosServidor, null, 2));
}

// ── Utilidades HTTP ────────────────────────────────────────────────────────
const tipos = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

function responder(res, codigo, contenido, tipo = 'application/json; charset=utf-8') {
  res.writeHead(codigo, {
    'Content-Type': tipo,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  if (typeof contenido === 'object' && !(contenido instanceof Buffer)) {
    res.end(JSON.stringify(contenido));
  } else {
    res.end(contenido);
  }
}

async function leerCuerpoJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ── Servidor HTTP ──────────────────────────────────────────────────────────
const servidor = createServer(async (solicitud, respuesta) => {
  const rutaUrl = new URL(solicitud.url || '/', 'http://localhost');
  const ruta = decodeURIComponent(rutaUrl.pathname);

  if (solicitud.method === 'OPTIONS') {
    return responder(respuesta, 204, '');
  }

  // 1. Clave pública VAPID
  if (solicitud.method === 'GET' && ruta === '/api/clave-publica') {
    return responder(respuesta, 200, { clave: claves.publicKey });
  }

  // 2. Suscripción Push
  if (solicitud.method === 'POST' && ruta === '/api/suscribir') {
    try {
      const sub = await leerCuerpoJson(solicitud);
      if (!sub || !sub.endpoint || !sub.keys) {
        return responder(respuesta, 400, { error: 'suscripción incompleta' });
      }

      const existe = datosServidor.suscripciones.some((s) => s.endpoint === sub.endpoint);
      if (!existe) {
        datosServidor.suscripciones.push(sub);
        await guardarDatos(datosServidor);
      }
      return responder(respuesta, 201, { ok: true, total: datosServidor.suscripciones.length });
    } catch {
      return responder(respuesta, 400, { error: 'JSON inválido' });
    }
  }

  // 3. Cancelar Suscripción Push
  if (solicitud.method === 'POST' && ruta === '/api/desuscribir') {
    try {
      const { endpoint } = await leerCuerpoJson(solicitud);
      datosServidor.suscripciones = datosServidor.suscripciones.filter((s) => s.endpoint !== endpoint);
      await guardarDatos(datosServidor);
      return responder(respuesta, 200, { ok: true, total: datosServidor.suscripciones.length });
    } catch {
      return responder(respuesta, 400, { error: 'JSON inválido' });
    }
  }

  // 4. Enviar notificación Push de prueba
  if (solicitud.method === 'POST' && ruta === '/api/enviar-prueba') {
    try {
      const {
        titulo = 'Organizador de Objetos',
        cuerpo = 'Mensaje de prueba desde el servidor',
        url = '/index.html',
      } = await leerCuerpoJson(solicitud);

      const mensaje = JSON.stringify({ titulo, cuerpo, url });
      const resultado = { enviados: 0, fallidos: 0, eliminadas: 0 };

      for (const sub of [...datosServidor.suscripciones]) {
        try {
          await webpush.sendNotification(sub, mensaje, { TTL: 60 });
          resultado.enviados++;
        } catch (err) {
          resultado.fallidos++;
          // 404/410: suscripción caducada o revocada por el usuario
          if (err.statusCode === 404 || err.statusCode === 410) {
            datosServidor.suscripciones = datosServidor.suscripciones.filter((s) => s.endpoint !== sub.endpoint);
            resultado.eliminadas++;
          } else {
            console.error('Error al enviar push:', err.statusCode ?? '', err.message);
          }
        }
      }

      await guardarDatos(datosServidor);
      return responder(respuesta, 200, resultado);
    } catch (err) {
      return responder(respuesta, 500, { error: err.message });
    }
  }

  // 5. Consultar objetos / tareas sincronizados
  if (solicitud.method === 'GET' && (ruta === '/api/objetos' || ruta === '/api/tareas')) {
    return responder(respuesta, 200, datosServidor.objetos);
  }

  // 6. Recibir sincronización outbox (Background Sync y Plan B)
  if (solicitud.method === 'POST' && (ruta === '/api/objetos' || ruta === '/api/tareas')) {
    try {
      const cambio = await leerCuerpoJson(solicitud);
      if (!cambio || !cambio.idCambio) {
        return responder(respuesta, 400, { error: 'El cambio debe incluir idCambio (UUID)' });
      }

      // Idempotencia: no duplicar si el reintento ya llegó
      const yaExiste = datosServidor.objetos.some((o) => o.idCambio === cambio.idCambio);
      if (yaExiste) {
        return responder(respuesta, 200, { ok: true, duplicado: true });
      }

      datosServidor.objetos.push(cambio);
      await guardarDatos(datosServidor);
      return responder(respuesta, 200, { ok: true, duplicado: false });
    } catch {
      return responder(respuesta, 400, { error: 'JSON inválido' });
    }
  }

  // 7. Servir archivos estáticos
  if (solicitud.method !== 'GET' && solicitud.method !== 'HEAD') {
    return responder(respuesta, 405, 'Método no permitido', 'text/plain');
  }

  try {
    const relativa = normalize(ruta === '/' ? 'index.html' : ruta.slice(1));
    const archivo = resolve(join(raiz, relativa));

    if (relative(raiz, archivo).startsWith('..')) {
      return responder(respuesta, 403, 'Acceso denegado', 'text/plain');
    }

    const contenido = await readFile(archivo);
    respuesta.writeHead(200, {
      'Cache-Control': relativa.endsWith('.html') || relativa.endsWith('.js') ? 'no-cache' : 'max-age=3600',
      'Content-Type': tipos[extname(archivo).toLowerCase()] || 'application/octet-stream',
    });
    if (solicitud.method === 'HEAD') respuesta.end();
    else respuesta.end(contenido);
  } catch {
    responder(respuesta, 404, 'Recurso no encontrado', 'text/plain');
  }
});

function iniciarServidor(puertoAUsar) {
  servidor.listen(puertoAUsar, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Servidor Organizador de Objetos activo en:`);
    console.log(`   http://localhost:${puertoAUsar}`);
    console.log(`======================================================\n`);
  });
}

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nuevoPuerto = puerto === 5500 ? 5505 : puerto + 1;
    console.warn(`\n⚠️  El puerto ${puerto} ya está ocupado (por la extensión Live Server de VS Code / IDE).`);
    console.warn(`   Cambiando automáticamente al puerto ${nuevoPuerto} para evitar conflicto con el servidor estático del IDE...\n`);
    iniciarServidor(nuevoPuerto);
  } else {
    console.error('Error en el servidor:', err);
  }
});

iniciarServidor(puerto);