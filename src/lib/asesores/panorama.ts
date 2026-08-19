/**
 * Panorama de asesores para la dirección (pedido de Jair, 2026-08-18):
 * «ver qué están trabajando, sus leads, el nivel de vida de los leads, y si
 * hay prioridades por atender».
 *
 * Dos piezas separadas a propósito:
 *   - `construirPanorama`: función PURA (sin Supabase) — es donde viven las
 *     definiciones de «sin contactar», «frío» y el orden de atención, y es
 *     lo que se puede probar sin base de datos.
 *   - `panoramaAsesores`: las 5 consultas, todas en paralelo y en lote (sin
 *     N+1 por asesor), y el ensamblado.
 *
 * Cliente admin (service-role): la página ya pasó por requireAdmin y esto
 * lee leads y actividad de OTROS usuarios (regla de la casa: acotar por
 * asesor_id a mano, la RLS no filtra a un admin).
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLES_QUE_ASESORAN } from '@/lib/asesores/roles'
import { ETAPAS_CERRADAS, NOTA_CIERRE } from '@/lib/leads/formato'
import { agruparPorEtapa, type SegmentoPipeline } from '@/lib/dashboard/pipeline'
import { inicioDeMesMonterrey } from '@/lib/fechas/monterrey'

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Umbrales del «nivel de vida» de un lead, en días desde su última señal de
 * vida (última actividad humana; si nunca hubo, desde que entró).
 *
 * No son arbitrarios: el escalamiento de guardias trabaja en horas y ya
 * cubre el primer día, así que aquí empieza donde aquel termina. Fresco =
 * se tocó dentro de las últimas 48 h; frío = una semana sin señales, que es
 * cuando un lead deja de ser una conversación y pasa a ser una pérdida.
 */
export const DIAS_FRESCO = 2
export const DIAS_FRIO = 7

/** Cuántos leads del asesor están frescos, tibios o fríos. */
export type VidaLeads = {
  frescos: number
  tibios: number
  frios: number
}

export type FilaPanorama = {
  userId: string
  nombre: string
  telefono: string | null
  email: string
  rol: string
  activo: boolean
  tienePush: boolean
  /** Leads asignados, no archivados y sin cerrar. */
  activos: number
  /** Etapa «nuevo» sin una sola actividad humana: nadie le ha hablado todavía. */
  sinContactar: number
  /** Activos con {@link DIAS_FRIO} días o más sin señales de vida. */
  frios: number
  /** Recordatorios pactados por el asesor cuya hora ya pasó y siguen pendientes. */
  recordatoriosVencidos: number
  /** Cierres ganados en el mes en curso (hora de Monterrey). */
  ganadosMes: number
  /** Reparto de sus leads activos por etapa, para la barra de pipeline. */
  pipeline: SegmentoPipeline[]
  vida: VidaLeads
  /** Última actividad humana del asesor sobre cualquiera de sus leads. */
  ultimaActividad: string | null
  /**
   * Suma de las tres colas (sin contactar + fríos + recordatorios vencidos).
   * Ordena la lista; NO se pinta como total, porque un mismo lead puede
   * estar en dos colas y sumado engañaría.
   */
  atencion: number
}

export type TotalesPanorama = {
  asesoresActivos: number
  activos: number
  sinContactar: number
  frios: number
  recordatoriosVencidos: number
  ganadosMes: number
  vida: VidaLeads
}

export type Panorama = {
  filas: FilaPanorama[]
  totales: TotalesPanorama
}

type AsesorCrudo = {
  user_id: string
  nombre: string
  telefono: string | null
  rol: string
  activo: boolean
}

type LeadCrudo = {
  id: string
  asesor_id: string | null
  etapa: string
  creado_en: string
}

export type EntradaPanorama = {
  asesores: AsesorCrudo[]
  /** Leads NO archivados de esos asesores, cerrados incluidos. */
  leads: LeadCrudo[]
  /** Última actividad humana por lead (lead_id → ISO). */
  ultimaActividadPorLead: Map<string, string>
  /** Última actividad humana por asesor (autor_id → ISO). */
  ultimaActividadPorAsesor: Map<string, string>
  /** Ids de leads con cierre ganado registrado dentro del mes en curso. */
  ganadosDelMes: Set<string>
  /** asesor_id → recordatorios pendientes ya vencidos. */
  recordatoriosVencidos: Map<string, number>
  idsConPush: Set<string>
  emailPorId: Map<string, string>
  ahora: Date
}

const CERRADAS: readonly string[] = ETAPAS_CERRADAS

function vidaVacia(): VidaLeads {
  return { frescos: 0, tibios: 0, frios: 0 }
}

/**
 * Ensambla el panorama. Puro: mismas entradas, mismas salidas — sin red,
 * sin reloj propio (el `ahora` entra por parámetro).
 *
 * Orden de la lista: primero quien más necesita atención, y a igualdad de
 * colas, quien más leads activos carga. Los inactivos siempre al final: no
 * están trabajando, no compiten por la mirada de la dirección.
 */
export function construirPanorama(entrada: EntradaPanorama): Panorama {
  const {
    asesores,
    leads,
    ultimaActividadPorLead,
    ultimaActividadPorAsesor,
    ganadosDelMes,
    recordatoriosVencidos,
    idsConPush,
    emailPorId,
    ahora,
  } = entrada

  const leadsPorAsesor = new Map<string, LeadCrudo[]>()
  for (const lead of leads) {
    if (!lead.asesor_id) continue
    const suyos = leadsPorAsesor.get(lead.asesor_id)
    if (suyos) suyos.push(lead)
    else leadsPorAsesor.set(lead.asesor_id, [lead])
  }

  const filas: FilaPanorama[] = asesores.map((asesor) => {
    const suyos = leadsPorAsesor.get(asesor.user_id) ?? []
    const activos = suyos.filter((lead) => !CERRADAS.includes(lead.etapa))

    const vida = vidaVacia()
    let sinContactar = 0

    for (const lead of activos) {
      const actividad = ultimaActividadPorLead.get(lead.id)
      // Sin actividad humana, la señal de vida es su llegada: un lead recién
      // entrado no es un lead frío, es un lead por contestar.
      const referencia = actividad ?? lead.creado_en
      const dias = (ahora.getTime() - new Date(referencia).getTime()) / DIA_MS

      if (dias >= DIAS_FRIO) vida.frios += 1
      else if (dias > DIAS_FRESCO) vida.tibios += 1
      else vida.frescos += 1

      if (lead.etapa === 'nuevo' && !actividad) sinContactar += 1
    }

    const vencidos = recordatoriosVencidos.get(asesor.user_id) ?? 0
    const ganadosMes = suyos.filter((lead) => ganadosDelMes.has(lead.id)).length

    return {
      userId: asesor.user_id,
      nombre: asesor.nombre,
      telefono: asesor.telefono,
      email: emailPorId.get(asesor.user_id) ?? '—',
      rol: asesor.rol,
      activo: asesor.activo,
      tienePush: idsConPush.has(asesor.user_id),
      activos: activos.length,
      sinContactar,
      frios: vida.frios,
      recordatoriosVencidos: vencidos,
      ganadosMes,
      pipeline: agruparPorEtapa(activos),
      vida,
      ultimaActividad: ultimaActividadPorAsesor.get(asesor.user_id) ?? null,
      atencion: sinContactar + vida.frios + vencidos,
    }
  })

  filas.sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1
    if (b.atencion !== a.atencion) return b.atencion - a.atencion
    if (b.activos !== a.activos) return b.activos - a.activos
    return a.nombre.localeCompare(b.nombre, 'es')
  })

  const enJuego = filas.filter((fila) => fila.activo)
  const totales: TotalesPanorama = {
    asesoresActivos: enJuego.length,
    activos: sumar(enJuego, (f) => f.activos),
    sinContactar: sumar(enJuego, (f) => f.sinContactar),
    frios: sumar(enJuego, (f) => f.frios),
    recordatoriosVencidos: sumar(enJuego, (f) => f.recordatoriosVencidos),
    ganadosMes: sumar(enJuego, (f) => f.ganadosMes),
    vida: {
      frescos: sumar(enJuego, (f) => f.vida.frescos),
      tibios: sumar(enJuego, (f) => f.vida.tibios),
      frios: sumar(enJuego, (f) => f.vida.frios),
    },
  }

  return { filas, totales }
}

function sumar(filas: FilaPanorama[], de: (fila: FilaPanorama) => number): number {
  return filas.reduce((total, fila) => total + de(fila), 0)
}

/**
 * Trae y arma el panorama completo.
 *
 * Las consultas de actividad y recordatorios se acotan a los leads de estos
 * asesores, no a la tabla entera: a esta escala (decenas de asesores, cientos
 * de leads) cabe de sobra en memoria y evita un `group by` que PostgREST no
 * hace.
 */
export async function panoramaAsesores(ahora: Date = new Date()): Promise<Panorama> {
  const supabase = createAdminClient()

  const { data: usuarios, error: errorUsuarios } = await supabase
    .from('usuarios')
    .select('user_id, nombre, telefono, rol, activo')
    .in('rol', ROLES_QUE_ASESORAN)
    .order('nombre', { ascending: true })

  if (errorUsuarios) throw new Error(`No se pudieron cargar los asesores: ${errorUsuarios.message}`)
  const asesores = (usuarios ?? []) as AsesorCrudo[]
  if (asesores.length === 0) {
    return {
      filas: [],
      totales: {
        asesoresActivos: 0,
        activos: 0,
        sinContactar: 0,
        frios: 0,
        recordatoriosVencidos: 0,
        ganadosMes: 0,
        vida: vidaVacia(),
      },
    }
  }

  const ids = asesores.map((a) => a.user_id)

  const { data: leadsCrudos, error: errorLeads } = await supabase
    .from('leads')
    .select('id, asesor_id, etapa, creado_en')
    .in('asesor_id', ids)
    .eq('archivado', false)

  if (errorLeads) throw new Error(`No se pudieron cargar los leads: ${errorLeads.message}`)
  const leads = (leadsCrudos ?? []) as LeadCrudo[]
  const idsLeads = leads.map((lead) => lead.id)

  const inicioMes = inicioDeMesMonterrey(ahora).toISOString()

  const [actividades, cierres, recordatorios, { data: suscripciones }, listado] = await Promise.all([
    // Actividad HUMANA: las notas de sistema (asignaciones, cambios de etapa)
    // no son señal de que alguien atendió al cliente.
    idsLeads.length > 0
      ? supabase
          .from('seguimientos')
          .select('lead_id, autor_id, creado_en')
          .in('lead_id', idsLeads)
          .neq('tipo', 'sistema')
          .order('creado_en', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    // Cierres ganados del mes: mismo criterio que cierresGanadosMes del
    // dashboard (nota de sistema con texto fijo), para que los números de
    // dos pantallas no se contradigan.
    idsLeads.length > 0
      ? supabase
          .from('seguimientos')
          .select('lead_id')
          .in('lead_id', idsLeads)
          .eq('tipo', 'sistema')
          .eq('nota', NOTA_CIERRE.cerrado_ganado)
          .gte('creado_en', inicioMes)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('recordatorios')
      .select('asesor_id')
      .in('asesor_id', ids)
      .eq('estado', 'pendiente')
      .lt('fecha_hora', ahora.toISOString()),
    supabase.from('push_suscripciones').select('usuario_id').in('usuario_id', ids),
    // El correo no vive en `usuarios` (mismo apaño que obtenerAsesores).
    supabase.auth.admin.listUsers({ perPage: 200 }),
  ])

  if (actividades.error) {
    throw new Error(`No se pudo cargar la actividad: ${actividades.error.message}`)
  }
  if (cierres.error) throw new Error(`No se pudieron cargar los cierres: ${cierres.error.message}`)
  if (recordatorios.error) {
    throw new Error(`No se pudieron cargar los recordatorios: ${recordatorios.error.message}`)
  }

  // Las filas vienen ordenadas desc: la PRIMERA que se ve de cada lead (y de
  // cada autor) es la más reciente.
  const ultimaActividadPorLead = new Map<string, string>()
  const ultimaActividadPorAsesor = new Map<string, string>()
  for (const fila of actividades.data ?? []) {
    const leadId = fila.lead_id as string
    if (!ultimaActividadPorLead.has(leadId)) ultimaActividadPorLead.set(leadId, fila.creado_en)
    const autor = fila.autor_id as string | null
    if (autor && !ultimaActividadPorAsesor.has(autor)) {
      ultimaActividadPorAsesor.set(autor, fila.creado_en)
    }
  }

  const recordatoriosVencidos = new Map<string, number>()
  for (const fila of recordatorios.data ?? []) {
    const asesorId = fila.asesor_id as string
    recordatoriosVencidos.set(asesorId, (recordatoriosVencidos.get(asesorId) ?? 0) + 1)
  }

  return construirPanorama({
    asesores,
    leads,
    ultimaActividadPorLead,
    ultimaActividadPorAsesor,
    ganadosDelMes: new Set((cierres.data ?? []).map((c) => c.lead_id as string)),
    recordatoriosVencidos,
    idsConPush: new Set((suscripciones ?? []).map((s) => s.usuario_id as string)),
    emailPorId: new Map((listado.data?.users ?? []).map((u) => [u.id, u.email ?? '—'])),
    ahora,
  })
}
