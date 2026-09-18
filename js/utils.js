// Funciones auxiliares pequeñas y reutilizables.

/**
 * Crea un elemento del DOM de forma segura (usa textContent, nunca innerHTML,
 * para evitar inyección de HTML con lo que escriba el usuario).
 */
export function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === false || valor == null) continue;
    if (clave === 'class') nodo.className = valor;
    else if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else nodo.setAttribute(clave, valor === true ? '' : valor);
  }
  for (const hijo of hijos.flat()) {
    if (hijo == null || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

/** Minúsculas y sin tildes: "Llaves" y "llavés" coinciden al buscar. */
export function normalizar(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

const formatoFecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatearFecha(timestamp) {
  return formatoFecha.format(new Date(timestamp));
}

/** Texto relativo sencillo: "hace 3 h", "hace 2 días". */
export function tiempoRelativo(timestamp) {
  const seg = Math.round((Date.now() - timestamp) / 1000);
  if (seg < 60) return 'hace un momento';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/** Convierte un timestamp al formato que espera <input type="datetime-local">. */
export function aValorDatetimeLocal(timestamp) {
  if (!timestamp) return '';
  const f = new Date(timestamp);
  const dosDigitos = (n) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dosDigitos(f.getMonth() + 1)}-${dosDigitos(f.getDate())}` +
         `T${dosDigitos(f.getHours())}:${dosDigitos(f.getMinutes())}`;
}
