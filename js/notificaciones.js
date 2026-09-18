/**
 * notificaciones.js - Recordatorios (funcionalidad complementaria).
 *
 * Los recordatorios se revisan mientras la aplicación está abierta y se
 * muestran como avisos dentro de la propia interfaz.
 */

/**
 * Recorre los objetos y avisa de los recordatorios vencidos.
 * @returns lista de objetos avisados (para que la UI pueda mostrar un toast si no hay permiso).
 */
export async function revisarRecordatorios(objetos, alMarcar) {
  const ahora = Date.now();
  const vencidos = objetos.filter(
    (o) => o.recordatorio && !o.recordatorioNotificado && o.recordatorio <= ahora,
  );

  for (const objeto of vencidos) {
    await alMarcar(objeto.id);
  }
  return vencidos;
}
