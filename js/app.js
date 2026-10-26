/**
 * app.js - Controlador principal de la interfaz.
 *
 * Flujo general:
 *   IndexedDB (db.js) -> estado en memoria -> render() -> DOM
 * Cada acción del usuario (crear, editar, mover, eliminar) modifica la BD y
 * luego vuelve a cargar y pintar la lista.
 */
import { CATEGORIAS, TODAS, INTERVALO_RECORDATORIOS_MS } from './constants.js';
import {
  abrirDB,
  crearObjeto, listarObjetos, obtenerObjeto, editarObjeto, moverObjeto,
  eliminarObjeto, filtrarObjetos, marcarRecordatorioNotificado,
} from './db.js';
import { el, formatearFecha, tiempoRelativo, aValorDatetimeLocal } from './utils.js';
import { redimensionarImagen } from './imagen.js';
import { crearMapa } from './mapa.js';
import {
  pedirPermisoNotificaciones,
  mostrarAvisoLocal,
  suscribirAPush,
  cancelarSuscripcionPush,
  obtenerSuscripcionActual,
  describirErrorPush,
  enviarPushPrueba,
  revisarRecordatorios,
} from './notificaciones.js';
import {
  encolarCambio,
  pedirSincronizacion,
  contarCambiosPendientes,
} from './sync.js';
import { registrarServiceWorker } from './pwa.js';
import {
  abrirCamara, detenerCamara, capturarFotograma, obtenerUbicacion,
  describirErrorDispositivo,
} from './dispositivo.js';

/* ---------------------------- Estado ---------------------------- */
const estado = {
  objetos: [],
  texto: '',
  categoria: TODAS,
  filtro: 'todos',
  orden: 'recientes',
  editandoId: null,   // null = creando; número = editando
  detalleId: null,    // objeto abierto en el diálogo de detalle
  fotoForm: null,     // Blob de la foto en el formulario
};
let urlsFoto = [];    // URLs temporales de fotos, se liberan en cada render

/* ------------------------ Referencias al DOM ------------------------ */
const $ = (id) => document.getElementById(id);
const ui = {
  buscar: $('input-buscar'), chips: $('chips-categorias'), lista: $('lista-objetos'),
  contador: $('contador'), vacio: $('estado-vacio'),
  vacioTitulo: $('vacio-titulo'), vacioTexto: $('vacio-texto'), btnVacio: $('btn-vacio-nuevo'),
  btnNuevo: $('btn-nuevo'), toast: $('toast'),
  // formulario
  dlgForm: $('dialogo-formulario'), form: $('form-objeto'), formTitulo: $('form-titulo'),
  fNombre: $('f-nombre'), fCategoria: $('f-categoria'), fUbicacion: $('f-ubicacion'),
  fNotas: $('f-notas'), fFoto: $('f-foto'), fFotoPreview: $('f-foto-preview'),
  fFotoQuitar: $('f-foto-quitar'), fRecordatorio: $('f-recordatorio'),
  fFotoCamara: $('f-foto-camara'), fUbicacionActual: $('f-ubicacion-actual'),
  fUbicacionAyuda: $('f-ubicacion-ayuda'),
  fMapaAbrir: $('f-mapa-abrir'), fMapa: $('mapa-formulario'), fMapaAyuda: $('f-mapa-ayuda'),
  formCancelar: $('form-cancelar'), formGuardar: $('form-guardar'),
  dlgCamara: $('dialogo-camara'), camaraVideo: $('camara-video'),
  camaraAyuda: $('camara-ayuda'), camaraCancelar: $('camara-cancelar'),
  camaraCapturar: $('camara-capturar'),
  // detalle
  dlgDetalle: $('dialogo-detalle'), detFoto: $('det-foto'), detCategoria: $('det-categoria'),
  detNombre: $('det-nombre'), detUbicacion: $('det-ubicacion'), detFecha: $('det-fecha'),
  detNotas: $('det-notas'), detRecordatorio: $('det-recordatorio'), detHistorial: $('det-historial'),
  detMapaContenedor: $('det-mapa-contenedor'), detMapa: $('mapa-detalle'),
  formMover: $('form-mover'), inputMover: $('input-mover'),
  detEliminar: $('det-eliminar'), detEditar: $('det-editar'), detCerrar: $('det-cerrar'),
  estadisticas: $('estadisticas-tarjetas'), estadisticasActualizacion: $('estadisticas-actualizacion'),
  actividad: $('actividad-reciente'), graficoCategorias: $('grafico-categorias'),
  chipsFiltros: $('chips-filtros'), selectOrden: $('select-orden'), btnTema: $('btn-tema'),
  // Sesión 26: Notificaciones Push y Sincronización Outbox
  btnAvisos: $('btn-avisos'), btnSuscribirPush: $('btn-suscribir-push'),
  btnPushPrueba: $('btn-push-prueba'), btnCancelarPush: $('btn-cancelar-push'),
  estadoSync: $('estado-sync'), estadoAvisos: $('estado-avisos'),
};
let streamCamara = null;
let mapaFormulario = null;
let mapaDetalle = null;
let coordenadasForm = null;

/* --------------------------- Utilidades UI --------------------------- */
let temporizadorToast;
function avisar(mensaje) {
  ui.toast.textContent = mensaje;
  ui.toast.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { ui.toast.hidden = true; }, 3200);
}

function urlDeFoto(blob) {
  const url = URL.createObjectURL(blob);
  urlsFoto.push(url);
  return url;
}

const ICONO_PIN = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z');
  svg.append(path);
  return svg;
};

/* ---------------------------- Render ---------------------------- */
function renderChips() {
  ui.chips.replaceChildren(
    ...[TODAS, ...CATEGORIAS].map((nombre) =>
      el('button', {
        class: 'chip', type: 'button',
        'aria-pressed': String(estado.categoria === nombre),
        onclick: () => {
          const categoriaActiva = estado.categoria === nombre;
          estado.categoria = categoriaActiva ? TODAS : nombre;
          if (nombre === TODAS || categoriaActiva) estado.filtro = 'todos';
          renderChips();
          renderChipsFiltros();
          render();
        },
      }, nombre)),
  );
}

function tarjeta(objeto) {
  const etiquetas = [
    objeto.foto && 'Foto',
    objeto.coordenadas && 'Ubicación exacta',
    objeto.recordatorio && 'Recordatorio',
  ].filter(Boolean);
  return el('button', {
    class: 'tarjeta', type: 'button',
    'aria-label': `${objeto.nombre}, ubicación: ${objeto.ubicacion}. Ver detalle`,
    onclick: () => abrirDetalle(objeto.id),
  },
    objeto.foto && el('img', { class: 'tarjeta__foto', src: urlDeFoto(objeto.foto), alt: '', loading: 'lazy' }),
    el('div', { class: 'tarjeta__cuerpo' },
      el('p', { class: 'tarjeta__categoria' }, objeto.categoria),
      el('h2', { class: 'tarjeta__nombre' }, objeto.nombre),
      el('p', { class: 'tarjeta__ubicacion' }, ICONO_PIN(), el('span', {}, objeto.ubicacion)),
      etiquetas.length > 0 && el('div', { class: 'tarjeta__etiquetas' },
        ...etiquetas.map((etiqueta) => el('span', { class: 'etiqueta' }, etiqueta))),
      el('p', { class: 'tarjeta__fecha' }, `Actualizado ${tiempoRelativo(objeto.actualizadoEn)}`),
    ),
  );
}

function render() {
  urlsFoto.forEach((u) => URL.revokeObjectURL(u));
  urlsFoto = [];

  let visibles = filtrarObjetos(estado.objetos, { texto: estado.texto, categoria: estado.categoria });
  visibles = visibles.filter((objeto) => {
    if (estado.filtro === 'foto') return Boolean(objeto.foto);
    if (estado.filtro === 'mapa') return Boolean(objeto.coordenadas);
    if (estado.filtro === 'recordatorio') return Boolean(objeto.recordatorio);
    return true;
  });
  visibles.sort((a, b) => {
    if (estado.orden === 'antiguos') return a.actualizadoEn - b.actualizadoEn;
    if (estado.orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
    if (estado.orden === 'categoria') return a.categoria.localeCompare(b.categoria, 'es');
    return b.actualizadoEn - a.actualizadoEn;
  });
  ui.lista.replaceChildren(...visibles.map(tarjeta));
  renderEstadisticas();
  renderActividad();
  renderGraficoCategorias();

  const total = estado.objetos.length;
  const hayFiltro = estado.texto.trim() !== '' || estado.categoria !== TODAS || estado.filtro !== 'todos' || estado.orden !== 'recientes';

  ui.contador.textContent = total === 0 ? '' :
    hayFiltro ? `${visibles.length} de ${total} objetos` : `${total} ${total === 1 ? 'objeto' : 'objetos'}`;

  ui.vacio.hidden = visibles.length > 0;
  if (visibles.length === 0) {
    if (total === 0) {
      ui.vacioTitulo.textContent = 'Aún no has registrado objetos';
      ui.vacioTexto.textContent = 'Guarda el primero y siempre sabrás dónde está.';
      ui.btnVacio.hidden = false;
    } else {
      ui.vacioTitulo.textContent = 'No hay resultados';
      ui.vacioTexto.textContent = 'Prueba con otro nombre o cambia los filtros seleccionados.';
      ui.btnVacio.hidden = true;
    }

  }
}

function renderChipsFiltros() {
  const filtros = [
    ['foto', 'Con fotografía'],
    ['mapa', 'Con ubicación'],
    ['recordatorio', 'Con recordatorio'],
  ];
  ui.chipsFiltros.replaceChildren(...filtros.map(([valor, nombre]) =>
    el('button', {
      class: 'chip chip--secundario', type: 'button',
      'aria-pressed': String(estado.filtro === valor),
      onclick: () => {
        estado.filtro = estado.filtro === valor ? 'todos' : valor;
        renderChipsFiltros();
        render();
      },
    }, nombre)));
}

function renderEstadisticas() {
  const total = estado.objetos.length;
  const conFoto = estado.objetos.filter((objeto) => objeto.foto).length;
  const conMapa = estado.objetos.filter((objeto) => objeto.coordenadas).length;
  const categorias = new Set(estado.objetos.map((objeto) => objeto.categoria)).size;
  const datos = [
    ['Objetos guardados', total, 'En tu inventario'],
    ['Con fotografía', conFoto, total ? `${Math.round((conFoto / total) * 100)}% del total` : 'Aún sin fotos'],
    ['Con ubicación exacta', conMapa, total ? `${Math.round((conMapa / total) * 100)}% del total` : 'Usa el mapa'],
    ['Categorías activas', categorias, 'Organización actual'],
  ];
  ui.estadisticas.replaceChildren(...datos.map(([titulo, valor, ayuda]) =>
    el('article', { class: 'estadistica' },
      el('strong', {}, String(valor)),
      el('span', {}, titulo),
      el('small', {}, ayuda),
    )));
  ui.estadisticasActualizacion.textContent = total
    ? `Actualizado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
    : '';
}

function renderActividad() {
  const recientes = [...estado.objetos].sort((a, b) => b.actualizadoEn - a.actualizadoEn).slice(0, 4);
  if (recientes.length === 0) {
    ui.actividad.replaceChildren(el('p', { class: 'panel-vacio' }, 'Aún no hay movimientos en tu inventario.'));
    return;
  }
  ui.actividad.replaceChildren(...recientes.map((objeto) =>
    el('button', {
      class: 'actividad__item', type: 'button',
      onclick: () => abrirDetalle(objeto.id),
    },
    el('span', { class: 'actividad__punto' }),
    el('span', { class: 'actividad__texto' },
      el('strong', {}, objeto.nombre),
      el('small', {}, `${objeto.ubicacion} · ${tiempoRelativo(objeto.actualizadoEn)}`)),
    el('span', { class: 'actividad__flecha', 'aria-hidden': 'true' }, '›'))));
}

function renderGraficoCategorias() {
  const cantidades = CATEGORIAS.map((categoria) => ({
    categoria,
    cantidad: estado.objetos.filter((objeto) => objeto.categoria === categoria).length,
  })).filter((dato) => dato.cantidad > 0);
  if (cantidades.length === 0) {
    ui.graficoCategorias.replaceChildren(el('p', { class: 'panel-vacio' }, 'Registra objetos para ver su distribución.'));
    return;
  }
  const maximo = Math.max(...cantidades.map((dato) => dato.cantidad));
  ui.graficoCategorias.replaceChildren(...cantidades.map(({ categoria, cantidad }) => {
    const fila = el('div', { class: 'grafico__fila' },
      el('span', { class: 'grafico__nombre' }, categoria),
      el('div', { class: 'grafico__barra' },
        el('span', { class: 'grafico__progreso' }),
      ),
      el('strong', { class: 'grafico__cantidad' }, String(cantidad)));
    fila.querySelector('.grafico__progreso').style.width = `${Math.round((cantidad / maximo) * 100)}%`;
    return fila;
  }));
}

async function recargar() {
  estado.objetos = await listarObjetos();
  render();
}

/* ------------------------ Formulario (crear/editar) ------------------------ */
function poblarCategorias() {
  ui.fCategoria.replaceChildren(...CATEGORIAS.map((c) => el('option', { value: c }, c)));
}

function mostrarFotoForm() {
  const hayFoto = Boolean(estado.fotoForm);
  ui.fFotoPreview.hidden = !hayFoto;
  ui.fFotoQuitar.hidden = !hayFoto;
  if (hayFoto) {
    const anterior = ui.fFotoPreview.src;
    if (anterior.startsWith('blob:')) URL.revokeObjectURL(anterior);
    ui.fFotoPreview.src = URL.createObjectURL(estado.fotoForm);
  } else {
    ui.fFotoPreview.removeAttribute('src');
  }
}

function limpiarErrores() {
  ui.form.querySelectorAll('.error').forEach((e) => { e.textContent = ''; });
}

function abrirFormulario(objeto = null) {
  estado.editandoId = objeto?.id ?? null;
  estado.fotoForm = objeto?.foto ?? null;
  coordenadasForm = objeto?.coordenadas ?? null;
  mapaFormulario?.destruir();
  mapaFormulario = null;
  limpiarErrores();
  ui.form.reset();

  ui.formTitulo.textContent = objeto ? 'Editar objeto' : 'Registrar objeto';
  ui.formGuardar.textContent = objeto ? 'Guardar cambios' : 'Guardar objeto';
  ui.fNombre.value = objeto?.nombre ?? '';
  ui.fCategoria.value = objeto?.categoria ?? CATEGORIAS[0];
  ui.fUbicacion.value = objeto?.ubicacion ?? '';
  ui.fNotas.value = objeto?.notas ?? '';
  ui.fRecordatorio.value = aValorDatetimeLocal(objeto?.recordatorio);
  ui.fUbicacionAyuda.textContent = 'Solo se solicita cuando pulsas el botón.';
  ui.fMapa.hidden = true;
  ui.fMapaAyuda.textContent = coordenadasForm
    ? 'Ya hay un punto seleccionado. Puedes cambiarlo.'
    : 'Haz clic en el mapa para colocar el marcador.';
  mostrarFotoForm();

  ui.dlgDetalle.close();
  ui.dlgForm.showModal();
  ui.fNombre.focus();
}

function validarFormulario() {
  limpiarErrores();
  let valido = true;
  const marcar = (campo, mensaje) => {
    ui.form.querySelector(`[data-error-para="${campo}"]`).textContent = mensaje;
    valido = false;
  };
  if (!ui.fNombre.value.trim()) marcar('nombre', 'Escribe el nombre del objeto.');
  if (!ui.fUbicacion.value.trim()) marcar('ubicacion', 'Indica dónde lo guardaste.');
  return valido;
}

async function guardarFormulario(evento) {
  evento.preventDefault();
  if (!validarFormulario()) return;

  const marca = ui.fRecordatorio.value ? new Date(ui.fRecordatorio.value).getTime() : null;
  const datos = {
    nombre: ui.fNombre.value,
    categoria: ui.fCategoria.value,
    ubicacion: ui.fUbicacion.value,
    notas: ui.fNotas.value,
    foto: estado.fotoForm,
    recordatorio: marca,
    coordenadas: coordenadasForm,
  };

  ui.formGuardar.disabled = true;
  try {
    if (estado.editandoId != null) {
      await editarObjeto(estado.editandoId, datos);
      avisar('Cambios guardados');
    } else {
      await crearObjeto(datos);
      avisar('Objeto registrado');
    }

    // Sesión 26: Registrar en bandeja outbox para Background Sync
    try {
      const db = await abrirDB();
      await encolarCambio(db, 'guardar-objeto', {
        nombre: datos.nombre,
        categoria: datos.categoria,
        ubicacion: datos.ubicacion,
        notas: datos.notas,
        actualizadoEn: Date.now(),
      });
      await actualizarEstadoSync();
      await pedirSincronizacion(db);
    } catch (errSync) {
      console.warn('Sync pendiente en outbox:', errSync.message);
    }
    await actualizarEstadoSync();

    ui.dlgForm.close();
    await recargar();
    await comprobarRecordatorios();
  } catch (error) {
    console.error(error);
    avisar('No se pudo guardar. Inténtalo de nuevo.');
  } finally {
    ui.formGuardar.disabled = false;
  }
}

function alternarMapaFormulario() {
  if (mapaFormulario) {
    mapaFormulario.destruir();
    mapaFormulario = null;
    ui.fMapa.hidden = true;
    ui.fMapaAbrir.textContent = 'Elegir punto en el mapa';
    return;
  }
  ui.fMapa.hidden = false;
  mapaFormulario = crearMapa(ui.fMapa, (coordenadas) => {
    coordenadasForm = coordenadas;
    ui.fMapaAyuda.textContent = `Punto seleccionado: ${coordenadas.latitud.toFixed(5)}, ${coordenadas.longitud.toFixed(5)}`;
  });
  if (!mapaFormulario) {
    ui.fMapaAyuda.textContent = 'El mapa no está disponible sin conexión.';
    return;
  }
  mapaFormulario.colocar(coordenadasForm);
  ui.fMapaAbrir.textContent = 'Ocultar mapa';
  setTimeout(() => mapaFormulario?.mapa.invalidateSize(), 0);
}

async function alElegirFoto() {
  const archivo = ui.fFoto.files?.[0];
  if (!archivo) return;
  estado.fotoForm = await redimensionarImagen(archivo);
  ui.fFoto.value = '';
  mostrarFotoForm();
}

async function iniciarCamara() {
  ui.camaraAyuda.textContent = 'Solicitando permiso de cámara...';
  ui.dlgForm.close();
  try {
    streamCamara = await abrirCamara();
    ui.camaraVideo.srcObject = streamCamara;
    ui.camaraAyuda.textContent = 'Alinea el objeto y pulsa «Capturar foto».';
    ui.dlgCamara.showModal();
  } catch (error) {
    if (!ui.dlgForm.open) ui.dlgForm.showModal();
    avisar(describirErrorDispositivo(error, 'camara'));
    ui.camaraAyuda.textContent = describirErrorDispositivo(error, 'camara');
  }
}

function cerrarCamara() {
  detenerCamara(streamCamara, ui.camaraVideo);
  streamCamara = null;
  if (ui.dlgCamara.open) ui.dlgCamara.close();
}

async function capturarFotoCamara() {
  try {
    estado.fotoForm = await redimensionarImagen(await capturarFotograma(ui.camaraVideo));
    mostrarFotoForm();
    cerrarCamara();
  } catch (error) {
    ui.camaraAyuda.textContent = error.message;
  }
}

async function usarUbicacionActual() {
  ui.fUbicacionActual.disabled = true;
  ui.fUbicacionAyuda.textContent = 'Solicitando permiso de ubicación...';
  try {
    const { coords } = await obtenerUbicacion();
    coordenadasForm = {
      latitud: coords.latitude,
      longitud: coords.longitude,
      precision: coords.accuracy,
    };
    ui.fUbicacion.value = `Coordenadas: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (precisión ±${Math.round(coords.accuracy)} m)`;
    ui.fUbicacionAyuda.textContent = 'Ubicación obtenida. Puedes editarla antes de guardar.';
    ui.fMapaAyuda.textContent = 'También puedes ajustar el punto exacto en el mapa.';
  } catch (error) {
    ui.fUbicacionAyuda.textContent = describirErrorDispositivo(error, 'ubicacion');
  } finally {
    ui.fUbicacionActual.disabled = false;
  }
}

/* ------------------------------ Detalle ------------------------------ */
async function abrirDetalle(id) {
  const objeto = await obtenerObjeto(id);
  if (!objeto) return;
  estado.detalleId = id;

  const anterior = ui.detFoto.src;
  if (anterior.startsWith('blob:')) URL.revokeObjectURL(anterior);
  if (objeto.foto) {
    ui.detFoto.src = URL.createObjectURL(objeto.foto);
    ui.detFoto.alt = `Fotografía de ${objeto.nombre}`;
    ui.detFoto.hidden = false;
  } else {
    ui.detFoto.hidden = true;
    ui.detFoto.removeAttribute('src');
  }

  ui.detCategoria.textContent = objeto.categoria;
  ui.detNombre.textContent = objeto.nombre;
  ui.detUbicacion.textContent = objeto.ubicacion;
  ui.detFecha.textContent = `Registrada el ${formatearFecha(objeto.actualizadoEn)}`;

  ui.detNotas.hidden = !objeto.notas;
  ui.detNotas.textContent = objeto.notas;

  ui.detRecordatorio.hidden = !objeto.recordatorio;
  if (objeto.recordatorio) {
    ui.detRecordatorio.textContent = objeto.recordatorioNotificado
      ? `Recordatorio enviado el ${formatearFecha(objeto.recordatorio)}`
      : `Recordatorio programado: ${formatearFecha(objeto.recordatorio)}`;
  }

  mapaDetalle?.destruir();
  mapaDetalle = null;
  ui.detMapaContenedor.hidden = !objeto.coordenadas;
  if (objeto.coordenadas) {
    mapaDetalle = crearMapa(ui.detMapa, () => {});
    mapaDetalle?.colocar(objeto.coordenadas);
    setTimeout(() => mapaDetalle?.mapa.invalidateSize(), 0);
  }

  ui.detHistorial.replaceChildren(
    ...[...objeto.historial].reverse().map((h) =>
      el('li', {}, el('span', {}, h.ubicacion), el('time', { datetime: new Date(h.fecha).toISOString() }, formatearFecha(h.fecha)))),
  );

  ui.inputMover.value = '';
  if (!ui.dlgDetalle.open) ui.dlgDetalle.showModal();
}

async function moverDesdeDetalle(evento) {
  evento.preventDefault();
  const nueva = ui.inputMover.value.trim();
  if (!nueva || estado.detalleId == null) return;
  await moverObjeto(estado.detalleId, nueva);
  avisar('Ubicación actualizada');

  // Sesión 26: Encolar en outbox cambio de ubicación
  try {
    const db = await abrirDB();
    await encolarCambio(db, 'mover-objeto', {
      id: estado.detalleId,
      nuevaUbicacion: nueva,
      actualizadoEn: Date.now(),
    });
    await actualizarEstadoSync();
    await pedirSincronizacion(db);
  } catch (errSync) {
    console.warn('Sync diferido outbox:', errSync.message);
  }
  await actualizarEstadoSync();

  await recargar();
  await abrirDetalle(estado.detalleId);
}

async function eliminarDesdeDetalle() {
  if (estado.detalleId == null) return;
  const objeto = estado.objetos.find((o) => o.id === estado.detalleId);
  if (!window.confirm(`¿Eliminar "${objeto?.nombre ?? 'este objeto'}"? Esta acción no se puede deshacer.`)) return;
  await eliminarObjeto(estado.detalleId);
  ui.dlgDetalle.close();
  avisar('Objeto eliminado');
  await recargar();
}

async function editarDesdeDetalle() {
  const objeto = await obtenerObjeto(estado.detalleId);
  if (objeto) abrirFormulario(objeto);
}

/* ---------------------------- Recordatorios ---------------------------- */
async function comprobarRecordatorios() {
  const avisados = await revisarRecordatorios(estado.objetos, marcarRecordatorioNotificado);
  if (avisados.length === 0) return;
  avisar(`Recordatorio: revisa "${avisados[0].nombre}" (${avisados[0].ubicacion})`);
  await recargar();
}

/* ------------------------------ Arranque ------------------------------ */
function conectarEventos() {
  ui.buscar.addEventListener('input', () => { estado.texto = ui.buscar.value; render(); });
  ui.selectOrden.addEventListener('change', () => { estado.orden = ui.selectOrden.value; render(); });

  ui.btnNuevo.addEventListener('click', () => abrirFormulario());
  ui.btnVacio.addEventListener('click', () => abrirFormulario());

  ui.form.addEventListener('submit', guardarFormulario);
  ui.formCancelar.addEventListener('click', () => ui.dlgForm.close());
  ui.fFoto.addEventListener('change', alElegirFoto);
  ui.fFotoCamara.addEventListener('click', iniciarCamara);
  ui.fFotoQuitar.addEventListener('click', () => { estado.fotoForm = null; mostrarFotoForm(); });
  ui.fUbicacionActual.addEventListener('click', usarUbicacionActual);
  ui.fMapaAbrir.addEventListener('click', alternarMapaFormulario);
  ui.camaraCancelar.addEventListener('click', cerrarCamara);
  ui.camaraCapturar.addEventListener('click', capturarFotoCamara);
  ui.dlgCamara.addEventListener('close', () => {
    detenerCamara(streamCamara, ui.camaraVideo);
    streamCamara = null;
    if (!document.hidden && !ui.dlgForm.open) ui.dlgForm.showModal();
  });
  ui.formMover.addEventListener('submit', moverDesdeDetalle);
  ui.detEliminar.addEventListener('click', eliminarDesdeDetalle);
  ui.detEditar.addEventListener('click', editarDesdeDetalle);
  ui.detCerrar.addEventListener('click', () => ui.dlgDetalle.close());
  ui.dlgDetalle.addEventListener('close', () => {
    mapaDetalle?.destruir();
    mapaDetalle = null;
  });
  ui.btnTema.addEventListener('click', alternarTema);
  renderChipsFiltros();
  aplicarTemaInicial();
  // Cerrar el detalle al tocar fuera de la tarjeta.
  ui.dlgDetalle.addEventListener('click', (e) => { if (e.target === ui.dlgDetalle) ui.dlgDetalle.close(); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && streamCamara) {
      cerrarCamara();
      avisar('La cámara se apagó al salir de la página.');
    }

    if (!document.hidden) comprobarRecordatorios();
  });
  window.addEventListener('pagehide', cerrarCamara);

  window.addEventListener('online', async () => {
    document.getElementById('indicador-conexion').hidden = true;
    try {
      const db = await abrirDB();
      await pedirSincronizacion(db);
    } catch (e) {
      console.warn('Fallo sync al volver online:', e);
    }
    await actualizarEstadoSync();
  });
  window.addEventListener('offline', () => document.getElementById('indicador-conexion').hidden = false);
  if (!navigator.onLine) {
    document.getElementById('indicador-conexion').hidden = false;
  }

  function aplicarTemaInicial() {
    const tema = localStorage.getItem('tema') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');
    document.documentElement.dataset.tema = tema;
    actualizarBotonTema(tema);
  }

  function actualizarBotonTema(tema) {
    const siguiente = tema === 'oscuro' ? 'claro' : 'oscuro';
    ui.btnTema.setAttribute('aria-label', `Cambiar a modo ${siguiente}`);
    ui.btnTema.title = `Cambiar a modo ${siguiente}`;
    ui.btnTema.classList.toggle('tema-claro', tema === 'claro');
  }

  function alternarTema() {
    const tema = document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('tema', tema);
    actualizarBotonTema(tema);
  }

  let deferredPrompt;
  const btnInstalar = document.getElementById('btn-instalar');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstalar.hidden = false;
  });

  btnInstalar.addEventListener('click', async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInstalar.hidden = true;
  });

  // ── Eventos Notificaciones Push y Background Sync (Sesión 26) ─────────────
  if (ui.btnAvisos) {
    ui.btnAvisos.addEventListener('click', async () => {
      const permiso = await pedirPermisoNotificaciones();
      if (permiso === 'granted') {
        await mostrarAvisoLocal(
          'Avisos activados',
          'Así se verán las alertas y recordatorios de tus objetos.',
          '/index.html'
        );
        avisar('Avisos activados');
      } else {
        avisar('No se activaron los avisos. La app sigue funcionando.');
      }
      await pintarEstadoAvisos();
    });
  }

  if (ui.btnSuscribirPush) {
    ui.btnSuscribirPush.addEventListener('click', async () => {
      try {
        const permiso = await pedirPermisoNotificaciones();
        if (permiso !== 'granted') {
          avisar('Debes conceder permiso de avisos para suscribirte a push.');
          await pintarEstadoAvisos();
          return;
        }
        avisar('Conectando al servicio push...');
        await suscribirAPush();
        avisar('¡Suscrito a notificaciones push!');
      } catch (err) {
        avisar(describirErrorPush(err));
      }
      await pintarEstadoAvisos();
    });
  }

  if (ui.btnCancelarPush) {
    ui.btnCancelarPush.addEventListener('click', async () => {
      try {
        await cancelarSuscripcionPush();
        avisar('Suscripción push cancelada.');
      } catch (err) {
        avisar('Error al cancelar: ' + err.message);
      }
      await pintarEstadoAvisos();
    });
  }

  if (ui.btnPushPrueba) {
    ui.btnPushPrueba.addEventListener('click', async () => {
      try {
        avisar('Enviando push de prueba...');
        const res = await enviarPushPrueba(
          'Organizador de Objetos',
          `Tienes ${estado.objetos.length} objeto(s) en tu inventario.`,
          '/index.html?desde=push'
        );
        avisar(`Push enviado: ${res.enviados} entregado(s).`);
      } catch (err) {
        avisar('Fallo push de prueba: ' + err.message);
      }
    });
  }

  // Notificación desde el SW cuando termina un sync
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_COMPLETADO') {
        actualizarEstadoSync();
        avisar(`Sincronizados ${event.data.enviados} cambio(s) con el servidor`);
      }
    });
  }
}

// ── Helpers de Estado de Sync y Avisos ──────────────────────────────────────
async function actualizarEstadoSync() {
  if (!ui.estadoSync) return;
  try {
    const db = await abrirDB();
    const pendientes = await contarCambiosPendientes(db);
    if (pendientes === 0) {
      ui.estadoSync.textContent = '☁ Todo sincronizado con el servidor';
      ui.estadoSync.classList.remove('pendiente');
    } else {
      ui.estadoSync.textContent = `☁ ${pendientes} cambio(s) pendiente(s) de enviar`;
      ui.estadoSync.classList.add('pendiente');
    }
  } catch (err) {
    console.warn('Error al verificar outbox:', err);
  }
}

async function pintarEstadoAvisos() {
  if (!ui.estadoAvisos) return;

  if (!('Notification' in window)) {
    ui.estadoAvisos.textContent = 'Avisos no soportados';
    ui.estadoAvisos.className = 'badge badge--avisos';
    if (ui.btnAvisos) ui.btnAvisos.disabled = true;
    if (ui.btnSuscribirPush) ui.btnSuscribirPush.disabled = true;
    return;
  }

  const permiso = Notification.permission;
  if (permiso === 'granted') {
    ui.estadoAvisos.textContent = 'Avisos activados';
    ui.estadoAvisos.className = 'badge badge--avisos activo';
  } else if (permiso === 'denied') {
    ui.estadoAvisos.textContent = 'Avisos bloqueados';
    ui.estadoAvisos.className = 'badge badge--avisos bloqueado';
  } else {
    ui.estadoAvisos.textContent = 'Avisos sin activar';
    ui.estadoAvisos.className = 'badge badge--avisos';
  }

  const sub = await obtenerSuscripcionActual();
  if (sub) {
    if (ui.btnSuscribirPush) ui.btnSuscribirPush.hidden = true;
    if (ui.btnCancelarPush) ui.btnCancelarPush.hidden = false;
    if (ui.btnPushPrueba) ui.btnPushPrueba.hidden = false;
    ui.estadoAvisos.textContent = 'Avisos activados · Push suscrito';
    ui.estadoAvisos.className = 'badge badge--avisos activo';
  } else {
    if (ui.btnSuscribirPush) ui.btnSuscribirPush.hidden = false;
    if (ui.btnCancelarPush) ui.btnCancelarPush.hidden = true;
    if (ui.btnPushPrueba) ui.btnPushPrueba.hidden = true;
  }
}

async function iniciar() {
  registrarServiceWorker();
  poblarCategorias();
  renderChips();
  conectarEventos();

  try {
    await recargar();
  } catch (error) {
    console.error('No se pudo abrir IndexedDB', error);
    avisar('No se pudo acceder al almacenamiento local.');
    return;
  }

  await actualizarEstadoSync();
  await pintarEstadoAvisos();

  await comprobarRecordatorios();
  setInterval(comprobarRecordatorios, INTERVALO_RECORDATORIOS_MS);

  if (new URLSearchParams(location.search).get('accion') === 'nuevo') abrirFormulario();
}

iniciar();

