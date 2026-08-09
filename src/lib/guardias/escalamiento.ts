/**
 * Motor de escalamiento de leads sin contestar — v2 con RONDAS en DIGEST
 * (Fase C, spec: docs/ultrapowers/plans/2026-08-09-escalamiento-v2.md).
 *
 * Lo invoca el cron cada 5 min con el admin client. Por cada lead sin
 * contestar (etapa 'nuevo', asignado, reloj vencido, sin seguimiento manual):
 *
 *  - Recordatorios al asesor RESPONSABLE: cada `recordatorio` min (15),
 *    repetidos hasta el umbral del dueño. paso = recordatorio_rN.
 *  - Escalamiento ABIERTO a todos: cada `abierto` min (30), repetido hasta
 *    el umbral del dueño («el primero que lo toma se lo queda»).
 *    paso = abierto_rN.
 *  - Umbral del dueño (120): correo + push al dueño, UNA vez (dueno_120).
 *    Después de esto NO hay más rondas: el lead vive en el panel «Leads en
 *    riesgo» del dashboard admin.
 *  - VIP: un único recordatorio al dueño (recordatorio_vip), sin rondas.
 *
 * Los pushes van EN DIGEST: por corrida se manda a lo mucho UN push por
 * destinatario con TODOS sus leads (evita la metralleta que entrena a
 * ignorar notificaciones). Las rondas vencidas se registran individualmente
 * (cron caído se pone al día en una corrida) pero el digest es único.
 *
 * Idempotencia: cada ronda INSERTa primero en lead_escalamientos (UNIQUE
 * lead_id+paso); si pierde la carrera (23505) no cuenta para el digest —
 * at-most-once por ronda aunque dos corridas se traslapen.
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

interface LeadPendiente {
  lead: LeadEscalable
  edadMin: number
}

export interface ResultadoEscalamiento {
  /** Leads evaluados (ya filtrados por la query base). */
  procesados: number
  /** `paso:leadId` de cada ronda registrada en esta corrida. */
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

  // Acumuladores del digest de esta corrida.
  const recordatoriosPorAsesor = new Map<string, LeadPendiente[]>()
  const abiertos: LeadPendiente[] = []

  for (const lead of (data ?? []) as LeadEscalable[]) {
    try {
      if (await tieneRespuestaManual(supabase, lead)) continue

      const vip = await esLeadVip(supabase, lead.propiedad_id, config)
      const edadMin = (ahora.getTime() - new Date(lead.escalamiento_desde).getTime()) / 60_000
      const umbrales = config.escalamientoMin

      if (vip) {
        // Los VIP solo reciben UN recordatorio al dueño; jamás rondas ni el
        // paso de 2h (decisión 4 del spec v2 — no spamear al dueño).
        if (edadMin >= umbrales.recordatorio && (await registrarPaso(supabase, lead.id, 'recordatorio_vip'))) {
          await recordatorioVip(supabase, lead)
          resultado.pasosEjecutados.push(`recordatorio_vip:${lead.id}`)
        }
        resultado.procesados += 1
        continue
      }

      // Rondas de recordatorio al responsable (r1 = a los 15, r2 = 30, ...).
      // Solo rondas con umbral ESTRICTAMENTE menor al del dueño: a partir de
      // ahí el problema es de dirección, no del asesor.
      const rondasRecordatorio = rondasVencidas(edadMin, umbrales.recordatorio, umbrales.dueno)
      let recordatorioNuevo = false
      for (const ronda of rondasRecordatorio) {
        if (await registrarPaso(supabase, lead.id, `recordatorio_r${ronda}`)) {
          recordatorioNuevo = true
          resultado.pasosEjecutados.push(`recordatorio_r${ronda}:${lead.id}`)
        }
      }
      if (recordatorioNuevo) {
        const lista = recordatoriosPorAsesor.get(lead.asesor_id) ?? []
        lista.push({ lead, edadMin })
        recordatoriosPorAsesor.set(lead.asesor_id, lista)
      }

      // Rondas de escalamiento abierto (r1 = a los 30, r2 = 60, ...).
      const rondasAbierto = rondasVencidas(edadMin, umbrales.abierto, umbrales.dueno)
      let abiertoNuevo = false
      for (const ronda of rondasAbierto) {
        if (await registrarPaso(supabase, lead.id, `abierto_r${ronda}`)) {
          abiertoNuevo = true
          resultado.pasosEjecutados.push(`abierto_r${ronda}:${lead.id}`)
        }
      }
      if (abiertoNuevo) abiertos.push({ lead, edadMin })

      // Umbral del dueño: una sola vez; de aquí en adelante el lead vive en
      // el panel «Leads en riesgo».
      if (edadMin >= umbrales.dueno && (await registrarPaso(supabase, lead.id, 'dueno_120'))) {
        await escalarAlDueno(supabase, lead, config)
        resultado.pasosEjecutados.push(`dueno_120:${lead.id}`)
      }

      resultado.procesados += 1
    } catch (error) {
      // Un lead con problema no detiene el escalamiento de los demás.
      resultado.errores.push(`lead ${lead.id}: ${mensajeDe(error)}`)
    }
  }

  // Digests: a lo mucho UN push por destinatario por corrida.
  try {
    await enviarDigestRecordatorios(supabase, recordatoriosPorAsesor)
  } catch (error) {
    resultado.errores.push(`digest recordatorios: ${mensajeDe(error)}`)
  }
  try {
    if (abiertos.length > 0) await enviarDigestAbiertos(supabase, abiertos)
  } catch (error) {
    resultado.errores.push(`digest abiertos: ${mensajeDe(error)}`)
  }

  return resultado
}

/**
 * Números de ronda vencidos para un intervalo dado: ronda k vence a los
 * k*intervalo min, y solo existen rondas con umbral < limite (el del dueño).
 */
function rondasVencidas(edadMin: number, intervaloMin: number, limiteMin: number): number[] {
  const rondas: number[] = []
  for (let k = 1; k * intervaloMin <= edadMin && k * intervaloMin < limiteMin; k++) {
    rondas.push(k)
  }
  return rondas
}

/** «Ana Cliente (45 min), Luis (15 min)» — más viejo primero. */
function resumen(pendientes: LeadPendiente[]): string {
  return [...pendientes]
    .sort((a, b) => b.edadMin - a.edadMin)
    .map((p) => `${p.lead.nombre} (${Math.floor(p.edadMin)} min)`)
    .join(', ')
}

function urlDeDigest(pendientes: LeadPendiente[], base: '/asesor/leads' | '/asesor/notificaciones'): string {
  return pendientes.length === 1 ? `/asesor/leads/${pendientes[0].lead.id}` : base
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

/** true si esta ronda la ganó esta corrida; false si ya estaba registrada (23505). */
async function registrarPaso(supabase: SupabaseClient, leadId: string, paso: string): Promise<boolean> {
  const { error } = await supabase.from('lead_escalamientos').insert({ lead_id: leadId, paso })
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return false
    throw new Error(`registro del paso ${paso}: ${error.message}`)
  }
  return true
}

/** UN push+campanita por asesor con TODOS sus leads pendientes. */
async function enviarDigestRecordatorios(
  supabase: SupabaseClient,
  porAsesor: Map<string, LeadPendiente[]>
): Promise<void> {
  for (const [asesorId, pendientes] of porAsesor) {
    const url = urlDeDigest(pendientes, '/asesor/leads')
    const cuerpo = `${resumen(pendientes)} — márcalos contactados o registra un seguimiento`
    const texto =
      pendientes.length === 1
        ? `Recordatorio: ${pendientes[0].lead.nombre} sigue sin respuesta`
        : `Recordatorio: ${pendientes.length} leads siguen sin respuesta`
    await crearNotificacion(supabase, { destinatarioId: asesorId, tipo: 'escalamiento', texto, url })
    await enviarPush(supabase, asesorId, {
      titulo: pendientes.length === 1 ? 'Lead sin contestar' : `${pendientes.length} leads sin contestar`,
      cuerpo,
      url,
    })
  }
}

/** UN push+campanita por asesor ACTIVO con todos los leads en toma abierta. */
async function enviarDigestAbiertos(supabase: SupabaseClient, abiertos: LeadPendiente[]): Promise<void> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'asesor')
    .eq('activo', true)
  if (error) throw new Error(`consulta de asesores activos: ${error.message}`)

  const url = urlDeDigest(abiertos, '/asesor/notificaciones')
  const cuerpo = `${resumen(abiertos)} — el primero que los tome se los queda`
  const titulo = abiertos.length === 1 ? 'Lead disponible — tómalo' : `${abiertos.length} leads disponibles — tómalos`
  const texto =
    abiertos.length === 1
      ? `Lead disponible: ${resumen(abiertos)} — el primero que lo tome se lo queda`
      : `${abiertos.length} leads disponibles: ${resumen(abiertos)} — el primero que los tome se los queda`

  for (const asesor of data ?? []) {
    await crearNotificacion(supabase, { destinatarioId: asesor.user_id, tipo: 'escalamiento', texto, url })
    await enviarPush(supabase, asesor.user_id, { titulo, cuerpo, url })
  }
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

/** Umbral del dueño: correo + push (o alerta a admins si no está configurado). */
async function escalarAlDueno(
  supabase: SupabaseClient,
  lead: LeadEscalable,
  config: ConfiguracionGuardias
): Promise<void> {
  const url = `/admin/leads/${lead.id}`
  const texto = `Lead sin atender 2 horas: ${lead.nombre} — revísalo en Leads en riesgo`

  if (!config.duenoUserId) {
    await notificarAdmins(supabase, { tipo: 'escalamiento', texto, url })
    return
  }

  await crearNotificacion(supabase, { destinatarioId: config.duenoUserId, tipo: 'escalamiento', texto, url })
  await enviarPush(supabase, config.duenoUserId, {
    titulo: 'Lead sin atender 2 horas',
    cuerpo: `${lead.nombre} sigue sin respuesta de nadie — está en tu panel de Leads en riesgo`,
    url,
  })
  if (config.correoDueno) {
    await enviarCorreo({
      para: config.correoDueno,
      asunto: `Lead sin atender: ${lead.nombre}`,
      html: `<p>El lead <strong>${lead.nombre}</strong> lleva 2 horas sin respuesta de ningún asesor.</p><p>Revíselo en la sección «Leads en riesgo» del CRM para decidir el siguiente paso.</p>`,
    })
  }
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
