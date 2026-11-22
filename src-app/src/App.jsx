import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  abrirDB,
  crearObjeto,
  editarObjeto,
  eliminarObjeto,
  filtrarObjetos,
  fusionarObjetosRemotos,
  inicializarDatosDemostracion,
  listarObjetos,
  marcarRecordatorioNotificado,
  moverObjeto,
  obtenerObjeto,
} from '../../js/db.js';
import { CATEGORIAS, TODAS, INTERVALO_RECORDATORIOS_MS } from '../../js/constants.js';
import { redimensionarImagen } from '../../js/imagen.js';
import {
  abrirCamara,
  capturarFotograma,
  detenerCamara,
  describirErrorDispositivo,
  obtenerUbicacion,
} from '../../js/dispositivo.js';
import {
  cancelarSuscripcionPush,
  mostrarAvisoLocal,
  obtenerSuscripcionActual,
  pedirPermisoNotificaciones,
  revisarRecordatorios,
  suscribirAPush,
} from '../../js/notificaciones.js';
import {
  contarCambiosPendientes,
  encolarCambio,
  hayServidorSQLite,
  obtenerObjetosServidor,
  pedirSincronizacion,
} from '../../js/sync.js';
import { filtrarInventario, normalizarBusqueda } from './filtros.js';
import '../../vendor/leaflet/leaflet.css';
import '../../vendor/leaflet/leaflet.js';

function Icono({ nombre, size = 20 }) {
  const rutas = {
    buscar: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    nuevo: <path d="M12 5v14M5 12h14"/>,
    ubicacion: <><path d="M12 21s7-6.2 7-13a7 7 0 1 0-14 0c0 6.8 7 13 7 13Z"/><circle cx="12" cy="8" r="2.5"/></>,
    tema: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></>,
    notificacion: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    flecha: <path d="m9 18 6-6-6-6"/>,
    cerrar: <path d="m6 6 12 12M18 6 6 18"/>,
    camara: <><path d="M4 7h4l2-3h4l2 3h4v12H4Z"/><circle cx="12" cy="13" r="3"/></>,
    sincronizar: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6 7a8 8 0 0 1 13 2M18 17A8 8 0 0 1 5 15"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {rutas[nombre]}
    </svg>
  );
}

function formatearFecha(timestamp) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(timestamp));
}

function tiempoRelativo(timestamp) {
  const segundos = Math.round((Date.now() - timestamp) / 1000);
  if (segundos < 60) return 'ahora';
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

function Mapa({ coordenadas, onSeleccionar, detalle = false }) {
  const contenedor = useRef(null);
  const mapa = useRef(null);
  const marcador = useRef(null);

  useEffect(() => {
    if (!contenedor.current || !window.L) return;
    window.L.Icon.Default.mergeOptions({
      iconUrl: '../vendor/leaflet/images/marker-icon.png',
      iconRetinaUrl: '../vendor/leaflet/images/marker-icon-2x.png',
      shadowUrl: '../vendor/leaflet/images/marker-shadow.png',
    });
    mapa.current = window.L.map(contenedor.current, { zoomControl: true })
      .setView(coordenadas ? [coordenadas.latitud, coordenadas.longitud] : [5.5353, -73.3678], 13);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(mapa.current);

    if (coordenadas) {
      marcador.current = window.L.marker([coordenadas.latitud, coordenadas.longitud])
        .addTo(mapa.current);
    }
    if (!detalle) {
      mapa.current.on('click', (evento) => {
        const punto = { latitud: evento.latlng.lat, longitud: evento.latlng.lng, precision: null };
        if (marcador.current) marcador.current.setLatLng(evento.latlng);
        else marcador.current = window.L.marker(evento.latlng).addTo(mapa.current);
        onSeleccionar?.(punto);
      });
    }
    setTimeout(() => mapa.current?.invalidateSize(), 100);
    return () => {
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  return <div ref={contenedor} className="mapa" />;
}

function Foto({ foto, nombre, grande = false }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!foto) {
      setUrl('');
      return;
    }
    const nueva = URL.createObjectURL(foto);
    setUrl(nueva);
    return () => URL.revokeObjectURL(nueva);
  }, [foto]);
  if (!url) return null;
  return <img className={grande ? 'detalle-foto' : 'tarjeta-foto'} src={url} alt={`Fotografía de ${nombre}`} />;
}

export default function App() {
  const [objetos, setObjetos] = useState([]);
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState(TODAS);
  const [filtro, setFiltro] = useState('todos');
  const [orden, setOrden] = useState('recientes');
  const [formulario, setFormulario] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [foto, setFoto] = useState(null);
  const [coordenadas, setCoordenadas] = useState(null);
  const [camaraVisible, setCamaraVisible] = useState(false);
  const [stream, setStream] = useState(null);
  const [movimiento, setMovimiento] = useState('');
  const [tema, setTema] = useState(localStorage.getItem('tema') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'));
  const [toast, setToast] = useState('');
  const [pendientes, setPendientes] = useState(0);
  const [servidorDisponible, setServidorDisponible] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [conPush, setConPush] = useState(false);
  const [avisoError, setAvisoError] = useState('');
  const video = useRef(null);

  const recargar = async () => setObjetos(await listarObjetos());

  const actualizarSync = async () => {
    try {
      const db = await abrirDB();
      setPendientes(await contarCambiosPendientes(db));
    } catch {
      setPendientes(0);
    }
  };

  const sincronizar = async () => {
    try {
      const disponible = await hayServidorSQLite();
      setServidorDisponible(disponible);
      if (!disponible) return;
      const db = await abrirDB();
      await pedirSincronizacion(db);
      const remotos = await obtenerObjetosServidor();
      await fusionarObjetosRemotos(remotos);
      await recargar();
      await actualizarSync();
    } catch (error) {
      console.warn('No se pudo sincronizar:', error);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('tema', tema);
  }, [tema]);

  useEffect(() => {
    let activo = true;
    (async () => {
      await inicializarDatosDemostracion();
      await recargar();
      await actualizarSync();
      await sincronizar();
      if (activo) {
        setConPush(Boolean(await obtenerSuscripcionActual()));
      }
    })();

    const onOnline = () => {
      setOnline(true);
      sincronizar();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const temporizador = setInterval(async () => {
      await revisarRecordatorios(await listarObjetos(), marcarRecordatorioNotificado);
    }, INTERVALO_RECORDATORIOS_MS);
    const sincronizacion = setInterval(sincronizar, 30_000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('../sw.js?v=20261122-react-2').catch(console.warn);
    }
    return () => {
      activo = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(temporizador);
      clearInterval(sincronizacion);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const temporizador = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(temporizador);
  }, [toast]);

  useEffect(() => () => {
    stream?.getTracks().forEach((pista) => pista.stop());
  }, [stream]);

  const filtrados = useMemo(
    () => filtrarInventario(objetos, texto, categoria, filtro, orden),
    [objetos, texto, categoria, filtro, orden]
  );

  const estadisticas = useMemo(() => [
    ['Objetos guardados', objetos.length, 'En tu inventario'],
    ['Con fotografía', objetos.filter((objeto) => objeto.foto).length, 'Fotos guardadas'],
    ['Con ubicación exacta', objetos.filter((objeto) => objeto.coordenadas).length, 'En el mapa'],
    ['Categorías activas', new Set(objetos.map((objeto) => objeto.categoria)).size, 'Organización actual'],
  ], [objetos]);

  const abrirNuevo = () => {
    setAvisoError('');
    setFormulario({ id: null, nombre: '', categoria: CATEGORIAS[0], ubicacion: '', notas: '', recordatorio: '' });
    setFoto(null);
    setCoordenadas(null);
  };

  const abrirEditar = async (objeto) => {
    setAvisoError('');
    setFormulario({
      id: objeto.id,
      nombre: objeto.nombre,
      categoria: objeto.categoria,
      ubicacion: objeto.ubicacion,
      notas: objeto.notas,
      recordatorio: objeto.recordatorio
        ? new Date(objeto.recordatorio).toISOString().slice(0, 16)
        : '',
    });
    setFoto(objeto.foto ?? null);
    setCoordenadas(objeto.coordenadas ?? null);
  };

  const guardarFormulario = async (evento) => {
    evento.preventDefault();
    if (!formulario.nombre.trim() || !formulario.ubicacion.trim()) return;
    const datos = {
      nombre: formulario.nombre,
      categoria: formulario.categoria,
      ubicacion: formulario.ubicacion,
      notas: formulario.notas,
      foto,
      recordatorio: formulario.recordatorio ? new Date(formulario.recordatorio).getTime() : null,
      coordenadas,
    };
    let objetoGuardado;
    if (formulario.id != null) objetoGuardado = await editarObjeto(formulario.id, datos);
    else objetoGuardado = await crearObjeto(datos);
    const db = await abrirDB();
    await encolarCambio(db, 'guardar-objeto', { ...objetoGuardado, foto: null });
    await actualizarSync();
    await sincronizar();
    await recargar();
    setFormulario(null);
    setToast(formulario.id != null ? 'Cambios guardados' : 'Objeto registrado');
  };

  const seleccionarFoto = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setFoto(await redimensionarImagen(archivo));
  };

  const abrirCamaraMovil = async () => {
    try {
      const nuevoStream = await abrirCamara();
      setStream(nuevoStream);
      setCamaraVisible(true);
      setTimeout(() => {
        if (video.current) video.current.srcObject = nuevoStream;
      }, 50);
    } catch (error) {
      setAvisoError(describirErrorDispositivo(error, 'camara'));
    }
  };

  const cerrarCamaraMovil = () => {
    detenerCamara(stream, video.current);
    setStream(null);
    setCamaraVisible(false);
  };

  const capturar = async () => {
    try {
      setFoto(await capturarFotograma(video.current));
      cerrarCamaraMovil();
    } catch (error) {
      setAvisoError(error.message);
    }
  };

  const usarUbicacion = async () => {
    try {
      const posicion = await obtenerUbicacion();
      setCoordenadas({
        latitud: posicion.coords.latitude,
        longitud: posicion.coords.longitude,
        precision: posicion.coords.accuracy,
      });
    } catch (error) {
      setAvisoError(describirErrorDispositivo(error, 'ubicacion'));
    }
  };

  const abrirDetalle = async (objeto) => {
    setDetalle(await obtenerObjeto(objeto.id));
  };

  const moverDesdeDetalle = async (evento) => {
    evento.preventDefault();
    if (!detalle || !movimiento.trim()) return;
    const actualizado = await moverObjeto(detalle.id, movimiento);
    setDetalle(actualizado);
    setMovimiento('');
    const db = await abrirDB();
    await encolarCambio(db, 'mover-objeto', { ...actualizado, foto: null });
    await actualizarSync();
    await sincronizar();
    await recargar();
    setToast('Ubicación actualizada');
  };

  const eliminarDesdeDetalle = async () => {
    if (!detalle || !window.confirm(`¿Eliminar "${detalle.nombre}"?`)) return;
    await eliminarObjeto(detalle.id);
    if (detalle.claveSincronizacion) {
      const db = await abrirDB();
      await encolarCambio(db, 'eliminar-objeto', {
        claveSincronizacion: detalle.claveSincronizacion,
        actualizadoEn: Date.now(),
      });
    }
    setDetalle(null);
    await sincronizar();
    await recargar();
    setToast('Objeto eliminado');
  };

  const activarNotificaciones = async () => {
    const permiso = await pedirPermisoNotificaciones();
    if (permiso === 'granted') {
      await mostrarAvisoLocal('Avisos activados', 'Las alertas de la app están disponibles.');
      setToast('Avisos activados');
    } else setToast('Los avisos no fueron activados');
  };

  const activarPush = async () => {
    try {
      await suscribirAPush();
      setConPush(true);
      setToast('Sincronización push activada');
    } catch (error) {
      setAvisoError(error.message);
    }
  };

  const cancelarPush = async () => {
    await cancelarSuscripcionPush();
    setConPush(false);
    setToast('Push cancelado');
  };

  const categoriasGrafico = CATEGORIAS.map((nombre) => ({
    nombre,
    cantidad: objetos.filter((objeto) => objeto.categoria === nombre).length,
  })).filter((dato) => dato.cantidad > 0);
  const maximo = Math.max(...categoriasGrafico.map((dato) => dato.cantidad), 1);

  return (
    <div className="app-movil">
      <header className="barra-superior">
        <div className="marca">
          <span className="marca-pin"><Icono nombre="ubicacion" size={20}/></span>
          <div>
            <strong>Organizador</strong>
            <small>Objetos perdidos</small>
          </div>
        </div>
        <div className="acciones-superiores">
          <button className="boton-icono" type="button" title="Tema" onClick={() =>
            setTema((actual) => actual === 'oscuro' ? 'claro' : 'oscuro')}>
            <Icono nombre="tema"/>
          </button>
          <button className="boton-icono" type="button" title="Notificaciones" onClick={activarNotificaciones}>
            <Icono nombre="notificacion"/>
          </button>
        </div>
      </header>

      {!online && (
        <div className="banner-conexion">Sin conexión · trabajando con datos guardados</div>
      )}

      <main>
        <section className="bienvenida-movil">
          <div>
            <span className="eyebrow">Tu memoria, organizada</span>
            <h1>Encuentra lo que necesitas</h1>
            <p>Todos tus objetos y ubicaciones en un solo lugar.</p>
          </div>
          <div className="estado-datos">
            <Icono nombre="sincronizar" size={17}/>
            {servidorDisponible ? (pendientes ? `${pendientes} pendiente(s)` : 'Sincronizado') : 'Solo este dispositivo'}
          </div>
        </section>

        <section className="estadisticas-movil" aria-label="Resumen del inventario">
          {estadisticas.map(([titulo, valor, ayuda]) => (
            <article className="estadistica-movil" key={titulo}>
              <strong>{valor}</strong>
              <span>{titulo}</span>
              <small>{ayuda}</small>
            </article>
          ))}
        </section>

        <section className="contenedor-busqueda">
          <label className="buscar">
            <Icono nombre="buscar" size={19}/>
            <input value={texto} onChange={(event) => setTexto(event.target.value)}
              type="search" placeholder="Buscar objeto, categoría o ubicación" />
          </label>
          <div className="barra-filtros">
            <div className="chips-movil">
              {[TODAS, ...CATEGORIAS].map((nombre) => (
                <button type="button" key={nombre}
                  className={categoria === nombre ? 'chip activo' : 'chip'}
                  aria-pressed={categoria === nombre}
                  onClick={() => setCategoria(nombre)}>{nombre}</button>
              ))}
            </div>
            <select value={orden} onChange={(event) => setOrden(event.target.value)} aria-label="Ordenar objetos">
              <option value="recientes">Más recientes</option>
              <option value="antiguos">Más antiguos</option>
              <option value="nombre">Nombre A-Z</option>
              <option value="categoria">Categoría</option>
            </select>
          </div>
          <div className="filtros-rapidos">
            {[
              ['todos', 'Todos'],
              ['con-foto', 'Con foto'],
              ['con-mapa', 'Con mapa'],
              ['recordatorios', 'Recordatorios'],
            ].map(([valor, textoFiltro]) => (
              <button type="button" key={valor}
                className={filtro === valor ? 'chip secundario activo' : 'chip secundario'}
                onClick={() => setFiltro(valor)}>{textoFiltro}</button>
            ))}
          </div>
        </section>

        <div className="seccion-lista">
          <div className="cabecera-seccion">
            <div>
              <span className="eyebrow">Inventario</span>
              <h2>{filtrados.length} {filtrados.length === 1 ? 'objeto' : 'objetos'}</h2>
            </div>
            {servidorDisponible && (
              <button className="boton-secundario" type="button" onClick={sincronizar}>
                <Icono nombre="sincronizar" size={16}/> Sincronizar
              </button>
            )}
            {conPush ? (
              <button className="boton-secundario" type="button" onClick={cancelarPush}>Cancelar push</button>
            ) : (
              <button className="boton-secundario" type="button" onClick={activarPush}>Activar push</button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <section className="estado-vacio">
              <span className="estado-vacio-icono"><Icono nombre="ubicacion" size={36}/></span>
              <h2>No encontramos objetos</h2>
              <p>Prueba con otro filtro o registra el siguiente objeto.</p>
              <button className="boton-naranja" type="button" onClick={abrirNuevo}>Registrar objeto</button>
            </section>
          ) : (
            <section className="lista-tarjetas">
              {filtrados.map((objeto) => (
                <button className={`tarjeta-movil${objeto.foto ? '' : ' sin-foto'}`} type="button" key={objeto.id} onClick={() => abrirDetalle(objeto)}>
                  <Foto foto={objeto.foto} nombre={objeto.nombre}/>
                  <div className="tarjeta-movil-cuerpo">
                    <span className="categoria">{objeto.categoria}</span>
                    <strong>{objeto.nombre}</strong>
                    <span className="ubicacion-tarjeta">
                      <Icono nombre="ubicacion" size={16}/>
                      <span>{objeto.ubicacion}</span>
                    </span>
                    <small>{tiempoRelativo(objeto.actualizadoEn)}</small>
                  </div>
                  <span className="flecha-tarjeta"><Icono nombre="flecha" size={18}/></span>
                </button>
              ))}
            </section>
          )}
        </div>

        {categoriasGrafico.length > 0 && (
          <section className="panel-analisis">
            <div className="cabecera-seccion">
              <div>
                <span className="eyebrow">Análisis</span>
                <h2>Objetos por categoría</h2>
              </div>
            </div>
            <div className="grafico-movil">
              {categoriasGrafico.map(({ nombre, cantidad }) => (
                <div className="grafico-fila" key={nombre}>
                  <span>{nombre}</span>
                  <div className="barra"><i style={{ width: `${Math.round((cantidad / maximo) * 100)}%` }}/></div>
                  <strong>{cantidad}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <button className="fab-movil" type="button" onClick={abrirNuevo}>
        <Icono nombre="nuevo" size={22}/><span>Registrar</span>
      </button>

      {formulario && (
        <div className="modal-capa" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setFormulario(null);
        }}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="formulario-titulo">
            <header className="modal-cabecera">
              <div>
                <span className="eyebrow">{formulario.id == null ? 'Nuevo registro' : 'Editar registro'}</span>
                <h2 id="formulario-titulo">{formulario.id == null ? 'Registrar objeto' : 'Editar objeto'}</h2>
              </div>
              <button className="boton-icono" type="button" onClick={() => setFormulario(null)} aria-label="Cerrar">
                <Icono nombre="cerrar"/>
              </button>
            </header>
            <form className="formulario" onSubmit={guardarFormulario}>
              <label>Nombre del objeto
                <input required maxLength={80} value={formulario.nombre}
                  onChange={(event) => setFormulario({ ...formulario, nombre: event.target.value })}
                  placeholder="Pasaporte"/>
              </label>
              <label>Categoría
                <select value={formulario.categoria}
                  onChange={(event) => setFormulario({ ...formulario, categoria: event.target.value })}>
                  {CATEGORIAS.map((nombre) => <option key={nombre}>{nombre}</option>)}
                </select>
              </label>
              <label>¿Dónde lo guardaste?
                <input required maxLength={120} value={formulario.ubicacion}
                  onChange={(event) => setFormulario({ ...formulario, ubicacion: event.target.value })}
                  placeholder="Cajón del escritorio"/>
              </label>
              <label>Notas
                <textarea maxLength={500} rows={3} value={formulario.notas}
                  onChange={(event) => setFormulario({ ...formulario, notas: event.target.value })}
                  placeholder="Detalles útiles para encontrarlo"/>
              </label>
              <label>Recordatorio
                <input type="datetime-local" value={formulario.recordatorio}
                  onChange={(event) => setFormulario({ ...formulario, recordatorio: event.target.value })}/>
              </label>
              <section className="grupo-media">
                <div>
                  <span>Fotografía</span>
                  <div className="acciones-media">
                    <label className="boton-secundario">Elegir foto
                      <input type="file" accept="image/*" capture="environment" onChange={seleccionarFoto}/>
                    </label>
                    <button className="boton-secundario" type="button" onClick={abrirCamaraMovil}>Abrir cámara</button>
                  </div>
                </div>
                {foto && <Foto foto={foto} nombre={formulario.nombre} grande />}
                {foto && <button className="boton-texto" type="button" onClick={() => setFoto(null)}>Quitar foto</button>}
              </section>
              <section className="grupo-mapa">
                <div className="acciones-media">
                  <button className="boton-secundario" type="button" onClick={usarUbicacion}>Usar ubicación actual</button>
                  {coordenadas && <button className="boton-texto" type="button" onClick={() => setCoordenadas(null)}>Quitar mapa</button>}
                </div>
                {coordenadas && <p className="ayuda">Punto: {coordenadas.latitud.toFixed(5)}, {coordenadas.longitud.toFixed(5)}</p>}
                <Mapa coordenadas={coordenadas} onSeleccionar={setCoordenadas}/>
              </section>
              {avisoError && <p className="error" role="alert">{avisoError}</p>}
              <div className="acciones-formulario">
                <button className="boton-secundario" type="button" onClick={() => setFormulario(null)}>Cancelar</button>
                <button className="boton-azul" type="submit">Guardar objeto</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {detalle && (
        <div className="modal-capa" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetalle(null);
        }}>
          <section className="modal detalle-modal" role="dialog" aria-modal="true" aria-labelledby="detalle-titulo">
            <header className="modal-cabecera">
              <div>
                <span className="categoria">{detalle.categoria}</span>
                <h2 id="detalle-titulo">{detalle.nombre}</h2>
              </div>
              <button className="boton-icono" type="button" onClick={() => setDetalle(null)} aria-label="Cerrar">
                <Icono nombre="cerrar"/>
              </button>
            </header>
            <Foto foto={detalle.foto} nombre={detalle.nombre} grande/>
            <div className="ubicacion-detalle">
              <Icono nombre="ubicacion" size={22}/>
              <div>
                <small>Última ubicación</small>
                <strong>{detalle.ubicacion}</strong>
                <span>{formatearFecha(detalle.actualizadoEn)}</span>
              </div>
            </div>
            {detalle.notas && <p className="notas-detalle">{detalle.notas}</p>}
            {detalle.coordenadas && <Mapa coordenadas={detalle.coordenadas} detalle/>}
            <form className="mover-ubicacion" onSubmit={moverDesdeDetalle}>
              <label htmlFor="nueva-ubicacion">Lo cambié de lugar</label>
              <div>
                <input id="nueva-ubicacion" value={movimiento} onChange={(event) => setMovimiento(event.target.value)}
                  placeholder="Nueva ubicación" maxLength={120}/>
                <button className="boton-azul" type="submit">Actualizar</button>
              </div>
            </form>
            <section className="historial">
              <h3>Historial de ubicaciones</h3>
              {[...(detalle.historial ?? [])].reverse().map((entrada, indice) => (
                <div key={`${entrada.fecha}-${indice}`}>
                  <span/>
                  <p><strong>{entrada.ubicacion}</strong><small>{formatearFecha(entrada.fecha)}</small></p>
                </div>
              ))}
            </section>
            <div className="acciones-detalle">
              <button className="boton-peligro" type="button" onClick={eliminarDesdeDetalle}>Eliminar</button>
              <button className="boton-secundario" type="button" onClick={() => {
                abrirEditar(detalle);
                setDetalle(null);
              }}>Editar</button>
              <button className="boton-azul" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </section>
        </div>
      )}

      {camaraVisible && (
        <div className="camara-modal" role="dialog" aria-modal="true">
          <h2>Tomar fotografía</h2>
          <video ref={video} autoPlay playsInline muted/>
          <div className="acciones-formulario">
            <button className="boton-secundario" type="button" onClick={cerrarCamaraMovil}>Cancelar</button>
            <button className="boton-naranja" type="button" onClick={capturar}>Capturar</button>
          </div>
        </div>
      )}

      {toast && <div className="toast-movil" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
