import { describe, expect, it } from 'vitest';
import { filtrarInventario } from './filtros.js';

const objetos = [
  { id: 1, nombre: 'Pasaporte', categoria: 'Documentos', ubicacion: 'Portafolio azul', notas: '', actualizadoEn: 30, foto: null, coordenadas: null },
  { id: 2, nombre: 'Celular', categoria: 'Electrónica', ubicacion: 'Mesa de noche', notas: 'Con cargador', actualizadoEn: 20, foto: {}, coordenadas: { latitud: 5, longitud: -73 } },
];

describe('filtrarInventario', () => {
  it('busca sin distinguir mayúsculas ni acentos', () => {
    expect(filtrarInventario(objetos, 'pasaporte')).toHaveLength(1);
    expect(filtrarInventario(objetos, 'electronica')[0]?.nombre).toBe('Celular');
  });

  it('combina categoría y filtros rápidos', () => {
    expect(filtrarInventario(objetos, '', 'Electrónica', 'con-foto')).toHaveLength(1);
    expect(filtrarInventario(objetos, '', 'Electrónica', 'con-mapa')).toHaveLength(1);
  });

  it('ordena por nombre', () => {
    expect(filtrarInventario(objetos, '', 'Todas', 'todos', 'nombre')[0].nombre).toBe('Celular');
  });
});
