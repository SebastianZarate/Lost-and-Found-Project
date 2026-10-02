# Organizador de Objetos Perdidos

Aplicación web para registrar dónde guardas tus objetos personales y encontrarlos rápido.

Proyecto final · Electiva III  
Integrantes: Juan Pablo Muñoz · Juan Sebastian Zarate · Gabriel Niño

Tecnologías: HTML5, CSS3 y JavaScript (módulos ES) puros, sin frameworks ni paso de compilación.

La aplicación incluye un Service Worker para practicar las estrategias de caché del Atlas 3D. No hay modelos `.glb` o `.gltf` todavía; los iconos del manifest son los assets binarios usados como ensayo.

---

## 1. Cómo ejecutarlo

La aplicación debe servirse desde un servidor local para que los módulos ES funcionen correctamente.

**Opción A: Node.js**
```bash
npm start
# abre http://localhost:5500
```

**Opción B: Python**
```bash
python -m http.server 5500
# abre http://localhost:5500
```

**Opción C: VS Code**: extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.

> Usa Chrome o Edge para las pruebas.

## 2. Estructura del proyecto

```
organizador-objetos-perdidos/
├── index.html               Estructura de la interfaz (diálogos, formulario, lista)
├── manifest.json             Manifest de la aplicación
├── sw.js                     Caché versionada y estrategias de red
├── css/
│   └── styles.css           Estilos responsive
├── js/
│   ├── app.js               Controlador: estado, render y eventos
│   ├── pwa.js                Registro del Service Worker
│   ├── db.js                IndexedDB: CRUD y búsqueda
│   ├── notificaciones.js    Recordatorios dentro de la aplicación
│   ├── imagen.js            Redimensiona fotos antes de guardarlas
│   ├── utils.js             Helpers (crear DOM, fechas, normalizar texto)
│   └── constants.js         Categorías y constantes
├── icons/                   Favicon de la aplicación
├── docs/                    Documentación para entrega y exposición
└── .github/copilot-instructions.md   Contexto para GitHub Copilot
```

## 3. Cumplimiento de la propuesta

| Requisito de la propuesta | Dónde está |
|---|---|
| Registro: nombre, categoría, ubicación, foto, notas | `index.html` (formulario) + `js/app.js` + `js/db.js › crearObjeto` |
| Categorías: Electrónica, Documentos, Llaves, Ropa, Accesorios, Otros | `js/constants.js` |
| Consulta y búsqueda por nombre o categoría | `js/db.js › filtrarObjetos` + buscador y chips |
| Última ubicación registrada visible al instante | Tarjetas y diálogo de detalle |
| Actualizar ubicación | `js/db.js › moverObjeto` (con historial) |
| Modificación y eliminación (alcance V1) | `editarObjeto`, `eliminarObjeto` |
| Almacenamiento local | `js/db.js` (IndexedDB) |
| Diseño responsive | `css/styles.css` |
| Notificaciones / recordatorios (complementario) | `js/notificaciones.js` |
| Recordatorios dentro de la aplicación | `js/notificaciones.js` |

Fuera del alcance V1 (según la propuesta): pagos, mensajería, inteligencia artificial y APIs externas complejas.

## 4. Cómo probar la aplicación

1. Abre la app en Chrome o Edge.
2. Registra un objeto y verifica su tarjeta y detalle.
3. Prueba búsqueda, filtros, edición, cambio de ubicación y eliminación.
4. Revisa **Storage › IndexedDB**: base `organizador-objetos-db` con el almacén `objetos`.

## 5. Publicarlo (opcional)

Todas las rutas son relativas, por lo que funciona en subcarpetas.

## 6. Caché del Atlas 3D

El Service Worker usa la caché `atlas3d-v2`:

- `install`: guarda `./`, `./index.html` y `./manifest.json` con `addAll()`.
- `install`: descarga los tres iconos y los guarda individualmente con `cache.put()`.
- `activate`: elimina cachés anteriores cuyo nombre empiece por `atlas3d-`.
- Iconos y futuros modelos 3D en `/icons/`: **Cache First**.
- Futuras rutas `/api/`: **Network First**.
- Resto del shell: **Stale-While-Revalidate**.

Para comprobarlo, abre DevTools → **Application → Cache Storage** y verifica `atlas3d-v2` con seis entradas. Las estrategias de caché están implementadas, pero el funcionamiento offline completo de futuros bundles generados dinámicamente requiere conocer o precachear esas rutas.

## 7. Documentación

- [`docs/01-analisis-documentos.md`](docs/01-analisis-documentos.md): qué piden los PDFs y cómo se cubrió
- [`docs/02-arquitectura.md`](docs/02-arquitectura.md): diagramas y decisiones técnicas
- [`docs/03-guia-de-exposicion.md`](docs/03-guia-de-exposicion.md): guion, código explicado y preguntas probables
- [`docs/04-plan-de-avances.md`](docs/04-plan-de-avances.md): lista de avances, pendientes y prompts para Copilot
