import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(new URL('..', import.meta.url)));
const puerto = Number(process.env.PORT || 5500);

const tipos = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const servidor = createServer(async (solicitud, respuesta) => {
  if (solicitud.method !== 'GET' && solicitud.method !== 'HEAD') {
    respuesta.writeHead(405, { Allow: 'GET, HEAD' });
    respuesta.end();
    return;
  }

  try {
    const rutaUrl = new URL(solicitud.url || '/', 'http://localhost');
    const ruta = decodeURIComponent(rutaUrl.pathname);
    const relativa = normalize(ruta === '/' ? 'index.html' : ruta.slice(1));
    const archivo = resolve(join(raiz, relativa));

    if (relative(raiz, archivo).startsWith('..')) {
      respuesta.writeHead(403);
      respuesta.end('Acceso denegado');
      return;
    }

    const contenido = await readFile(archivo);
    respuesta.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': tipos[extname(archivo).toLowerCase()] || 'application/octet-stream',
    });
    if (solicitud.method === 'HEAD') respuesta.end();
    else respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    respuesta.end('Recurso no encontrado');
  }
});

servidor.listen(puerto, () => {
  console.log(`Servidor disponible en http://localhost:${puerto}`);
});