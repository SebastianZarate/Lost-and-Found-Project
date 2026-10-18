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
│   ├── dispositivo.js       Cámara y geolocalización opcionales
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

## 4. APIs del dispositivo

Las APIs se solicitan únicamente después de una acción explícita y la aplicación
conserva sus funciones principales si el permiso se rechaza o el dispositivo no
cuenta con el hardware:

- **Cámara:** `Abrir cámara` usa `getUserMedia`, captura un fotograma y detiene
  todas las pistas al cerrar, cambiar de pestaña o salir de la página. Elegir una
  imagen desde el dispositivo continúa disponible como alternativa.
- **Ubicación:** `Usar mi ubicación actual` usa `getCurrentPosition` y registra
  latitud, longitud y precisión en el campo de ubicación para que el usuario
  pueda editar el texto antes de guardar.
- **Mapa:** Leaflet se sirve localmente y permite seleccionar un punto exacto
  sobre teselas de OpenStreetMap. Las coordenadas se guardan junto al objeto
  y se muestran nuevamente en su detalle.
No se solicita micrófono porque la aplicación no tiene una función de audio que
lo necesite.

## 5.1 Interfaz y preferencias

- El inicio incluye un resumen visual con estadísticas de objetos, fotografías,
  ubicaciones exactas y categorías.
- El botón **Modo oscuro / Modo claro** respeta la preferencia del sistema y
  conserva la elección del usuario para futuras visitas.
- La interfaz usa tarjetas, una sección de bienvenida y diseño responsive para
  que la información siga siendo legible en teléfono y escritorio.

## 6. Cómo probar la aplicación

1. Abre la app en Chrome o Edge.
2. Registra un objeto y verifica su tarjeta y detalle.
3. Prueba búsqueda, filtros, edición, cambio de ubicación y eliminación.
4. Revisa **Storage › IndexedDB**: base `organizador-objetos-db` con el almacén `objetos`.

## 7. Publicarlo (GitHub Pages)

La aplicación está preparada para GitHub Pages. El workflow
`.github/workflows/deploy-pages.yml` publica automáticamente la rama
`develop` después de cada `push`, incluyendo los cambios que llegan al
integrarse un Pull Request hacia `develop`.

Para activarlo en GitHub:

1. Abre **Settings → Pages** del repositorio.
2. En **Build and deployment**, selecciona **GitHub Actions**.
3. Integra un Pull Request en `develop` o haz `git push origin develop`.
4. Consulta la URL que aparecerá en la ejecución del workflow.

Todas las rutas son relativas, por lo que funciona en subcarpetas. El mapa
usa Leaflet incluido localmente y teselas de OpenStreetMap; las teselas
requieren conexión a Internet, mientras que los datos guardados siguen en
IndexedDB del dispositivo.

## 8. Caché del Atlas 3D

El Service Worker usa la caché `atlas3d-v2`:

- `install`: guarda `./`, `./index.html` y `./manifest.json` con `addAll()`.
- `install`: descarga los tres iconos y los guarda individualmente con `cache.put()`.
- `activate`: elimina cachés anteriores cuyo nombre empiece por `atlas3d-`.
- Iconos y futuros modelos 3D en `/icons/`: **Cache First**.
- Futuras rutas `/api/`: **Network First**.
- Resto del shell: **Stale-While-Revalidate**.

Para comprobarlo, abre DevTools → **Application → Cache Storage** y verifica `atlas3d-v2` con seis entradas. Las estrategias de caché están implementadas, pero el funcionamiento offline completo de futuros bundles generados dinámicamente requiere conocer o precachear esas rutas.

## 9. Documentación

- [`docs/01-analisis-documentos.md`](docs/01-analisis-documentos.md): qué piden los PDFs y cómo se cubrió
- [`docs/02-arquitectura.md`](docs/02-arquitectura.md): diagramas y decisiones técnicas
- [`docs/03-guia-de-exposicion.md`](docs/03-guia-de-exposicion.md): guion, código explicado y preguntas probables
- [`docs/04-plan-de-avances.md`](docs/04-plan-de-avances.md): lista de avances, pendientes y prompts para Copilot
