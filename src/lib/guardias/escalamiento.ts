/**
 * Motor de escalamiento de leads sin contestar (Fase B guardias).
 *
 * Lo invoca el cron cada 5 min (/api/cron/escalamiento) con el admin client.
 * Los pasos son por UMBRAL de edad, no por tick exacto: si el cron estuvo
 * caído, al volver ejecuta todos los pasos vencidos en una sola corrida.
 * Idempotencia: cada paso INSERTa primero en lead_escalamientos (UNIQUE
 * lead_id+paso); si pierde la carrera (23505) NO repite el side effect —
 * at-most-once aunque dos corridas se traslapen.
 *
 * «Contestado» = etapa != 'nuevo' O un seguimiento manual (tipo != 'sistema')
 * posterior a la asignación — cualquiera saca al lead de la query y detiene
 * todo (decisión 3 del spec).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { esLeadVip, leerConfiguracion, type ConfiguracionGuardias } from '@/lib/guardias/consultas'
import { crearNotificacion, notificarAdmins } from '@/lib/notificaciones/crear'
import { enviarPush } from '@/lib/push/enviar'
import { enviarCorreo } from '@/lib/correo/enviar'

const UNIQUE_VIOLATION = '23505'

interface LeadEscalable {
  id: string
  nombre: string
  asesor_id: string
  propiedad_id: string | null
  escalamiento_desde: string
  asignado_en: string | null
}

export interface ResultadoEscalamiento {
  /** Leads evaluados (ya filtrados por la query base). */
  procesados: number
  /** `paso:leadId` de cada side effect realmente ejecutado en esta corrida. */
  pasosEjecutados: string[]
  errores: string[]
}

export async function procesarEscalamientos(
  supabase: SupabaseClient,
  ahora: Date
): Promise<ResultadoEscalamiento> {
  const resultado: ResultadoEscalamiento = { procesados: 0, pasosEjecutados: [], errores: [] }

  let config: ConfiguracionGuardias
  try {
    config = await leerConfiguracion(supabase)
  } catch (error) {
    resultado.errores.push(`configuracion: ${mensajeDe(error)}`)
    return resultado
  }

  // Query base del spec. `lte` deja fuera los relojes diferidos aún futuros
  // (lead nocturno: su escalamiento arranca cuando abre el turno).
  const { data, error } = await supabase
    .from('leads')
    .select('id, nombre, asesor_id, propiedad_id, escalamiento_desde, asignado_en')
    .eq('etapa', 'nuevo')
    .eq('archivado', false)
    .not('asesor_id', 'is', null)
    .not('escalamiento_desde', 'is', null)
    .lte('escalamiento_desde', ahora.toISOString())
  if (error) {
    resultado.errores.push(`consulta de leads escalables: ${error.message}`)
    return resultado
  }

  for (const lead of (data ?? []) as LeadEscalable[]) {
    try {
      if (await tieneRespuestaManual(supabase, lead)) continue

      const vip = await esLeadVip(supabase, lead.propiedad_id, config)
      const edadMin = (ahora.getTime() - new Date(lead.escalamiento_desde).getTime()) / 60_000
      const umbrales = config.escalamientoMin

      if (vip) {
        // Los VIP solo reciben recordatorio al dueño; jamás escalamiento
        // abierto ni el paso de 2h (decisión 5 del spec).
        if (edadMin >= umbrales.recordatorio && (await registrarPaso(supabase, lead.id, 'recordatorio_vip'))) {
          await recordatorioVip(supabase, lead)
          resultado.pasosEjecutados.push(`recordatorio_vip:${lead.id}`)
        }
      } else {
        if (edadMin >= umbrales.recordatorio && (await registrarPaso(supabase, lead.id, 'recordatorio_15'))) {
          await recordatorioAsesor(supabase, lead)
          resultado.pasosEjecutados.push(`recordatorio_15:${lead.id}`)
        }
        if (edadMin >= umbrales.abierto && (await registrarPaso(supabase, lead.id, 'abierto_30'))) {
          await abrirATodosLosAsesores(supabase, lead)
          resultado.pasosEjecutados.push(`abierto_30:${lead.id}`)
        }
        if (edadMin >= umbrales.dueno && (await registrarPaso(supabase, lead.id, 'dueno_120'))) {
          await escalarAlDueno(supabase, lead, config)
          resultado.pasosEjecutados.push(`dueno_120:${lead.id}`)
        }
      }
      resultado.procesados += 1
    } catch (error) {
      // Un lead con problema no detiene el escalamiento de los demás.
      resultado.errores.push(`lead ${lead.id}: ${mensajeDe(error)}`)
    }
  }

  return resultado
}

/** Seguimiento MANUAL posterior a la asignación = ya le contestaron. */
async function tieneRespuestaManual(supabase: SupabaseClient, lead: LeadEscalable): Promise<boolean> {
  const desde = lead.asignado_en ?? lead.escalamiento_desde
  const { data, error } = await supabase
    .from('seguimientos')
    .select('id')
    .eq('lead_id', lead.id)
    .neq('tipo', 'sistema')
    .gt('creado_en', desde)
    .limit(1)
  if (error) throw new Error(`consulta de seguimientos: ${error.message}`)
  return (data ?? []).length > 0
}

/** true si este paso lo ganó esta corrida; false si ya estaba registrado (23505). */
async function registrarPaso(
  supabase: SupabaseClient,
  leadId: string,
  paso: 'recordatorio_15' | 'abierto_30' | 'dueno_120' | 'recordatorio_vip'
): Promise<boolean> {
  const { error } = await supabase.from('lead_escalamientos').insert({ lead_id: leadId, paso })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false
    throw new Error(`registro del paso ${paso}: ${error.message}`)
  }
  return true
}

async function recordatorioAsesor(supabase: SupabaseClient, lead: LeadEscalable): Promise<void> {
  const url = `/asesor/leads/${lead.id}`
  const texto = `Recordatorio: ${lead.nombre} sigue sin respuesta`
  await crearNotificacion(supabase, {
    destinatarioId: lead.asesor_id,
    tipo: 'escalamiento',
    texto,
    url,
  })
  await enviarPush(supabase, lead.asesor_id, {
    titulo: 'Lead sin contestar',
    cuerpo: `${lead.nombre} sigue esperando — márcalo contactado o registra un seguimiento`,
    url,
  })
}

async function recordatorioVip(supabase: SupabaseClient, lead: LeadEscalable): Promise<void> {
  const url = `/admin/leads/${lead.id}`
  await crearNotificacion(supabase, {
    destinatarioId: lead.asesor_id,
    tipo: 'escalamiento',
    texto: `Recordatorio: el lead VIP ${lead.nombre} sigue sin respuesta`,
    url,
  })
  await enviarPush(supabase, lead.asesor_id, {
    titulo: 'Lead VIP sin contestar',
    cuerpo: `${lead.nombre} sigue esperando tu decisión`,
    url,
  })
}

/** Paso 30 min: push a TODOS los asesores activos con la acción «Tomar lead». */
async function abrirATodosLosAsesores(supabase: SupabaseClient, lead: LeadEscalable): Promise<void> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'asesor')
    .eq('activo', true)
  if (error) throw new Error(`consulta de asesores activos: ${error.message}`)

  const url = `/asesor/leads/${lead.id}`
  for (const asesor of data ?? []) {
    await crearNotificacion(supabase, {
      destinatarioId: asesor.user_id,
      tipo: 'escalamiento',
      texto: `Lead disponible: ${lead.nombre} lleva 30 min sin respuesta — el primero que lo tome se lo queda`,
      url,
    })
    await enviarPush(supabase, asesor.user_id, {
      titulo: 'Lead disponible — tómalo',
      cuerpo: `${lead.nombre} lleva 30 min sin respuesta; el primero que lo tome se lo queda`,
      url,
    })
  }
}

/** Paso 2h: correo + push al dueño (o alerta a admins si no está configurado). */
async function escalarAlDueno(
  supabase: SupabaseClient,
  lead: LeadEscalable,
  config: ConfiguracionGuardias
): Promise<void> {
  const url = `/admin/leads/${lead.id}`
  const texto = `Lead sin atender 2 horas: ${lead.nombre}`

  if (!config.duenoUserId) {
    await notificarAdmins(supabase, { tipo: 'escalamiento', texto, url })
    return
  }

  await crearNotificacion(supabase, { destinatarioId: config.duenoUserId, tipo: 'escalamiento', texto, url })
  await enviarPush(supabase, config.duenoUserId, {
    titulo: 'Lead sin atender 2 horas',
    cuerpo: `${lead.nombre} sigue sin respuesta de nadie`,
    url,
  })
  if (config.correoDueno) {
    await enviarCorreo({
      para: config.correoDueno,
      asunto: `Lead sin atender: ${lead.nombre}`,
      html: `<p>El lead <strong>${lead.nombre}</strong> lleva 2 horas sin respuesta de ningún asesor.</p><p>Revíselo en el CRM para decidir el siguiente paso.</p>`,
    })
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
