/**
 * APIs de dispositivo.
 *
 * Cada función comprueba la disponibilidad antes de pedir permisos para que
 * la aplicación siga funcionando igual en equipos sin cámara o ubicación.
 */

export async function estadoPermiso(nombre) {
  if (!navigator.permissions) return 'desconocido';
  try {
    const resultado = await navigator.permissions.query({ name: nombre });
    return resultado.state;
  } catch {
    return 'desconocido';
  }
}

export function abrirCamara(facingMode = 'environment') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('La cámara no está disponible en este contexto.', 'TypeError');
  }
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
}

export function detenerCamara(stream, video) {
  stream?.getTracks().forEach((pista) => pista.stop());
  if (video) video.srcObject = null;
}

export function capturarFotograma(video) {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('La cámara todavía no está lista.');
  }
  const lienzo = document.createElement('canvas');
  lienzo.width = video.videoWidth;
  lienzo.height = video.videoHeight;
  lienzo.getContext('2d').drawImage(video, 0, 0);
  return new Promise((resolve, reject) => {
    lienzo.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo capturar la fotografía.'));
    }, 'image/jpeg', 0.85);
  });
}

export function obtenerUbicacion() {
  if (!navigator.geolocation) {
    return Promise.reject(new DOMException('La geolocalización no está disponible.', 'NotSupportedError'));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
  });
}

export function describirErrorDispositivo(error, tipo) {
  if (tipo === 'ubicacion') {
    if (error?.code === 1) return 'Bloqueaste la ubicación. Puedes escribirla manualmente.';
    if (error?.code === 2) return 'No fue posible determinar tu ubicación. Escríbela manualmente.';
    if (error?.code === 3) return 'La ubicación tardó demasiado. Escríbela manualmente.';
    return 'La ubicación no está disponible en este dispositivo.';
  }

  switch (error?.name) {
    case 'NotAllowedError': return 'Bloqueaste el permiso de cámara. Puedes elegir una foto de tu dispositivo.';
    case 'NotFoundError': return 'Este dispositivo no tiene una cámara disponible.';
    case 'NotReadableError': return 'La cámara está siendo usada por otra aplicación.';
    case 'TypeError': return 'La cámara solo funciona en HTTPS o en localhost.';
    default: return 'No se pudo abrir la cámara. Puedes elegir una foto de tu dispositivo.';
  }
}
