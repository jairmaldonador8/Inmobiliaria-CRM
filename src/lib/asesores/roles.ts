/**
 * Roles que ejercen de asesor. Modelo admin-operador: los admins atienden
 * leads con su misma cuenta (sin cuentas «+asesor» aparte), así que cuentan
 * como asesores en repartos, asignaciones, guardias y escalamiento.
 *
 * El alta/baja de asesores en /admin/asesores sigue operando SOLO sobre
 * rol 'asesor': desactivar una cuenta admin desde ahí bloquearía todo su
 * acceso, no solo su faceta de asesor.
 */
export const ROLES_QUE_ASESORAN = ['asesor', 'admin']
