/**
 * Resolutor de asignación automática de leads por guardias (Fase B).
 *
 * `decidirAsignacion` es la regla de negocio pura (orden del spec: VIP →
 * guardia activa → siguiente guardia → bandeja). `resolverAsignacion` la
 * alimenta con las consultas. El caller (sync de EasyBroker) es responsable
 * de degradar a bandeja si algo lanza: el sync JAMÁS pierde un lead por las
 * guardias.
 *
 * `escalamientoDesde` es un SNAPSHOT: si el admin edita el rol después, el
 * reloj de un lead ya asignado no se mueve (decisión 2 del spec).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  esLeadVip,
  guardiaActiva,
  leerConfiguracion,
  siguienteGuardia,
  ventanaGuardia,
  type ConfiguracionGuardias,
  type Guardia,
} from '@/lib/guardias/consultas'

export type DecisionAsignacion =
  | { tipo: 'vip'; asesorId: string; escalamientoDesde: string; fueraDeHorario: boolean }
  | { tipo: 'guardia_activa'; asesorId: string; escalamientoDesde: string }
  | { tipo: 'guardia_futura'; asesorId: string; escalamientoDesde: string }
  | { tipo: 'bandeja' }

export function decidirAsignacion(entrada: {
  ahora: Date
  esVip: boolean
  config: ConfiguracionGuardias
  activa: Guardia | null
  siguiente: Guardia | null
}): DecisionAsignacion {
  const { ahora, esVip, config, activa, siguiente } = entrada

  // Regla VIP: solo opera con dueño configurado; si no, flujo normal (fail-safe).
  if (esVip && config.duenoUserId) {
    if (activa) {
      return {
        tipo: 'vip',
        asesorId: config.duenoUserId,
        escalamientoDesde: ahora.toISOString(),
        fueraDeHorario: false,
      }
    }
    if (siguiente) {
      // Un VIP nocturno NO despierta al dueño a las 3:15: su recordatorio
      // corre desde la apertura del siguiente turno (el push de entrada que
      // manda el sync sí es inmediato).
      return {
        tipo: 'vip',
        asesorId: config.duenoUserId,
        escalamientoDesde: ventanaGuardia(siguiente).inicio.toISOString(),
        fueraDeHorario: true,
      }
    }
    // Sin rol no hay turno del cual diferir: reloj desde ahora.
    return {
      tipo: 'vip',
      asesorId: config.duenoUserId,
      escalamientoDesde: ahora.toISOString(),
      fueraDeHorario: false,
    }
  }

  if (activa) {
    return {
      tipo: 'guardia_activa',
      asesorId: activa.asesor_id,
      escalamientoDesde: ahora.toISOString(),
    }
  }

  if (siguiente) {
    return {
      tipo: 'guardia_futura',
      asesorId: siguiente.asesor_id,
      escalamientoDesde: ventanaGuardia(siguiente).inicio.toISOString(),
    }
  }

  return { tipo: 'bandeja' }
}

/**
 * Resuelve la decisión de asignación para un lead nuevo. Devuelve también la
 * configuración leída para que el caller notifique (dueño, correo) sin
 * repetir consultas. Lanza en errores de consulta: el caller degrada a
 * bandeja + alerta a admins.
 */
export async function resolverAsignacion(
  supabase: SupabaseClient,
  propiedadId: string | null,
  ahora: Date
): Promise<{ decision: DecisionAsignacion; config: ConfiguracionGuardias }> {
  const config = await leerConfiguracion(supabase)
  const esVip = await esLeadVip(supabase, propiedadId, config)
  const activa = await guardiaActiva(supabase, ahora)
  const siguiente = activa ? null : await siguienteGuardia(supabase, ahora)

  return { decision: decidirAsignacion({ ahora, esVip, config, activa, siguiente }), config }
}
