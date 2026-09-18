# Instrucciones para GitHub Copilot

## Proyecto
"Organizador de Objetos Perdidos": aplicación web para registrar dónde se guardan objetos personales y encontrarlos rápido. Proyecto académico (Electiva III). Complejidad baja–media; priorizar claridad y facilidad de explicar.

## Stack y restricciones
- HTML + CSS + JavaScript puro con **módulos ES**. Sin frameworks, sin bundlers, sin TypeScript.
- Sin dependencias externas en tiempo de ejecución (ni CDNs, ni fuentes web).
- Datos en **IndexedDB** solo a través de `js/db.js`. No usar localStorage para datos de objetos.
- Rutas **relativas** (`./`, `css/…`) para poder publicar en subcarpetas.

## Convenciones
- Código, comentarios, textos de interfaz y commits en **español**.
- Identificadores en español, camelCase (`crearObjeto`, `estado`, `ubicacion`).
- Para el DOM usar el helper `el()` de `js/utils.js` o `textContent`. **Nunca** `innerHTML` con datos del usuario.
- Cada archivo tiene una responsabilidad: `app.js` (UI/estado), `db.js` (datos), `notificaciones.js`, `imagen.js`, `utils.js`, `constants.js`.
- Mantener funciones pequeñas y comentadas con el "por qué", no el "qué".
- Accesibilidad: `label` en campos, foco visible, `aria-live` para avisos, respetar `prefers-reduced-motion`.

## Modelo de datos (almacén `objetos`)
`id, nombre, categoria, ubicacion, notas, foto (Blob|null), historial[{ubicacion,fecha}], recordatorio, recordatorioNotificado, creadoEn, actualizadoEn`.
Si se cambia el esquema, subir `DB_VERSION` en `db.js` y migrar en `onupgradeneeded`.

## Categorías
Electrónica, Documentos, Llaves, Ropa, Accesorios, Otros (definidas en `js/constants.js`).

## Fuera de alcance (V1)
Pagos, mensajería, inteligencia artificial, APIs externas complejas, backend/sincronización.

## Cómo ejecutar
`npm start` (http://localhost:5500) o `python -m http.server 5500`.
