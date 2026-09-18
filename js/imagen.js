import { FOTO_MAX_LADO } from './constants.js';

/**
 * Reduce una foto antes de guardarla en IndexedDB.
 * Una foto de celular puede pesar varios MB; redimensionada a ~1024 px
 * y comprimida como JPEG queda en unos 100-200 KB.
 */
export async function redimensionarImagen(archivo, maxLado = FOTO_MAX_LADO, calidad = 0.8) {
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close?.();

    const blob = await new Promise((resolve) => lienzo.toBlob(resolve, 'image/jpeg', calidad));
    return blob ?? archivo;
  } catch {
    // Si el navegador no puede procesarla, se guarda tal cual.
    return archivo;
  }
}
