import { CATEGORIAS, TODAS } from '../../js/constants.js';

export function normalizarBusqueda(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarInventario(objetos, texto = '', categoria = TODAS, filtro = 'todos', orden = 'recientes') {
  const consulta = normalizarBusqueda(texto);
  const filtrados = objetos.filter((objeto) => {
    if (categoria !== TODAS && objeto.categoria !== categoria) return false;
    if (filtro === 'con-foto' && !objeto.foto) return false;
    if (filtro === 'con-mapa' && !objeto.coordenadas) return false;
    if (filtro === 'recordatorios' && !objeto.recordatorio) return false;
    if (!consulta) return true;
    const contenido = normalizarBusqueda(
      `${objeto.nombre} ${objeto.categoria} ${objeto.ubicacion} ${objeto.notas}`
    );
    return consulta.split(/\s+/).every((palabra) => contenido.includes(palabra));
  });

  return [...filtrados].sort((a, b) => {
    if (orden === 'antiguos') return a.actualizadoEn - b.actualizadoEn;
    if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es');
    if (orden === 'categoria') return a.categoria.localeCompare(b.categoria, 'es');
    return b.actualizadoEn - a.actualizadoEn;
  });
}
