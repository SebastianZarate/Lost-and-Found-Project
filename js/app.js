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
  crearObjeto, listarObjetos, obtenerObjeto, editarObjeto, moverObjeto,
  eliminarObjeto, filtrarObjetos, marcarRecordatorioNotificado,
} from './db.js';
import { el, formatearFecha, tiempoRelativo, aValorDatetimeLocal } from './utils.js';
import { redimensionarImagen } from './imagen.js';
import { revisarRecordatorios } from './notificaciones.js';

/* ---------------------------- Estado ---------------------------- */
const estado = {
  objetos: [],
  texto: '',
  categoria: TODAS,
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
  formCancelar: $('form-cancelar'), formGuardar: $('form-guardar'),
  // detalle
  dlgDetalle: $('dialogo-detalle'), detFoto: $('det-foto'), detCategoria: $('det-categoria'),
  detNombre: $('det-nombre'), detUbicacion: $('det-ubicacion'), detFecha: $('det-fecha'),
  detNotas: $('det-notas'), detRecordatorio: $('det-recordatorio'), detHistorial: $('det-historial'),
  formMover: $('form-mover'), inputMover: $('input-mover'),
  detEliminar: $('det-eliminar'), detEditar: $('det-editar'), detCerrar: $('det-cerrar'),
};

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
        onclick: () => { estado.categoria = nombre; renderChips(); render(); },
      }, nombre)),
  );
}

function tarjeta(objeto) {
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
      el('p', { class: 'tarjeta__fecha' }, `Actualizado ${tiempoRelativo(objeto.actualizadoEn)}`),
    ),
  );
}

function render() {
  urlsFoto.forEach((u) => URL.revokeObjectURL(u));
  urlsFoto = [];

  const visibles = filtrarObjetos(estado.objetos, { texto: estado.texto, categoria: estado.categoria });
  ui.lista.replaceChildren(...visibles.map(tarjeta));

  const total = estado.objetos.length;
  const hayFiltro = estado.texto.trim() !== '' || estado.categoria !== TODAS;

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
      ui.vacioTexto.textContent = 'Prueba con otro nombre o cambia la categoría seleccionada.';
      ui.btnVacio.hidden = true;
    }
  }
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
  limpiarErrores();
  ui.form.reset();

  ui.formTitulo.textContent = objeto ? 'Editar objeto' : 'Registrar objeto';
  ui.formGuardar.textContent = objeto ? 'Guardar cambios' : 'Guardar objeto';
  ui.fNombre.value = objeto?.nombre ?? '';
  ui.fCategoria.value = objeto?.categoria ?? CATEGORIAS[0];
  ui.fUbicacion.value = objeto?.ubicacion ?? '';
  ui.fNotas.value = objeto?.notas ?? '';
  ui.fRecordatorio.value = aValorDatetimeLocal(objeto?.recordatorio);
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

async function alElegirFoto() {
  const archivo = ui.fFoto.files?.[0];
  if (!archivo) return;
  estado.fotoForm = await redimensionarImagen(archivo);
  ui.fFoto.value = '';
  mostrarFotoForm();
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

  ui.btnNuevo.addEventListener('click', () => abrirFormulario());
  ui.btnVacio.addEventListener('click', () => abrirFormulario());

  ui.form.addEventListener('submit', guardarFormulario);
  ui.formCancelar.addEventListener('click', () => ui.dlgForm.close());
  ui.fFoto.addEventListener('change', alElegirFoto);
  ui.fFotoQuitar.addEventListener('click', () => { estado.fotoForm = null; mostrarFotoForm(); });

  ui.formMover.addEventListener('submit', moverDesdeDetalle);
  ui.detEliminar.addEventListener('click', eliminarDesdeDetalle);
  ui.detEditar.addEventListener('click', editarDesdeDetalle);
  ui.detCerrar.addEventListener('click', () => ui.dlgDetalle.close());
  // Cerrar el detalle al tocar fuera de la tarjeta.
  ui.dlgDetalle.addEventListener('click', (e) => { if (e.target === ui.dlgDetalle) ui.dlgDetalle.close(); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) comprobarRecordatorios();
  });
}

async function iniciar() {
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

  await comprobarRecordatorios();
  setInterval(comprobarRecordatorios, INTERVALO_RECORDATORIOS_MS);

  if (new URLSearchParams(location.search).get('accion') === 'nuevo') abrirFormulario();
}

iniciar();
