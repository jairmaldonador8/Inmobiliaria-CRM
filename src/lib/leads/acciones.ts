'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

import { requireAdmin, requireAsesor, type UsuarioActual } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarEvento } from '@/lib/eventos/registrar'
import { crearNotificacion } from '@/lib/notificaciones/crear'
import { leadEnEscalamientoAbierto } from '@/lib/guardias/consultas'
import { normalizarTelefono } from '@/lib/easybroker/mapeo'
import { FUENTES_LEAD, type FuenteLead } from '@/lib/leads/formato'

export type ResultadoAccion = { ok: true } | { error: string }

/** Rutas admin que muestran leads; se revalidan tras cada mutación. */
const RUTAS_LEADS = ['/admin/bandeja', '/admin/leads'] as const

function revalidarRutasLeads() {
  for (const ruta of RUTAS_LEADS) revalidatePath(ruta)
}

/**
 * Verifica que el asesor exista, tenga rol asesor y esté activo.
 * Devuelve su nombre o null si no está disponible.
 */
async function obtenerAsesorActivo(
  supabase: SupabaseClient,
  asesorId: string
): Promise<{ nombre: string } | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('user_id', asesorId)
    .eq('rol', 'asesor')
    .eq('activo', true)
    .maybeSingle()

  if (error || !data) return null
  return data
}

/**
 * Registra el seguimiento de sistema y la notificación al asesor tras una
 * (re)asignación. Best-effort documentado: la asignación ya quedó
 * persistida; si esta parte falla se reporta el error sin deshacerla.
 */
async function registrarAsignacion(
  supabase: SupabaseClient,
  opciones: {
    leadId: string
    leadNombre: string
    asesorId: string
    asesorNombre: string
    admin: UsuarioActual
    reasignacion: boolean
  }
): Promise<void> {
  const { leadId, leadNombre, asesorId, asesorNombre, admin, reasignacion } = opciones

  const verbo = reasignacion ? 'Reasignado' : 'Asignado'
  const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
    lead_id: leadId,
    autor_id: admin.user_id,
    tipo: 'sistema',
    nota: `${verbo} a ${asesorNombre} por ${admin.nombre}`,
  })
  if (errorSeguimiento) {
    throw new Error(`No se pudo registrar el seguimiento: ${errorSeguimiento.message}`)
  }

  await crearNotificacion(supabase, {
    destinatarioId: asesorId,
    tipo: 'lead_asignado',
    texto: `Nuevo lead asignado: ${leadNombre}`,
    url: `/asesor/leads/${leadId}`,
  })
}

/**
 * Asigna un lead de la BANDEJA a un asesor. Solo aplica sobre leads sin
 * asesor (asesor_id IS NULL): si dos admins asignan a la vez, el segundo
 * update no afecta filas y se responde 'ya fue asignado' en lugar de
 * pisar la primera asignación.
 *
 * Va por service-role: los column grants de RLS impiden que un usuario
 * authenticated toque leads.asesor_id directamente.
 */
export async function asignarLead(leadId: string, asesorId: string): Promise<ResultadoAccion> {
  const admin = await requireAdmin()
  const supabase = createAdminClient()

  const asesor = await obtenerAsesorActivo(supabase, asesorId)
  if (!asesor) return { error: 'El asesor no está disponible' }

  const { data: actualizados, error } = await supabase
    .from('leads')
    .update({ asesor_id: asesorId, asignado_en: new Date().toISOString() })
    .eq('id', leadId)
    .is('asesor_id', null)
    .eq('archivado', false)
    .select('id, nombre')

  if (error) return { error: `No se pudo asignar el lead: ${error.message}` }
  const lead = actualizados?.[0]
  if (!lead) return { error: 'Este lead ya fue asignado' }

  try {
    await registrarAsignacion(supabase, {
      leadId,
      leadNombre: lead.nombre,
      asesorId,
      asesorNombre: asesor.nombre,
      admin,
      reasignacion: false,
    })
  } catch (e) {
    revalidarRutasLeads()
    return { error: e instanceof Error ? e.message : 'Error al registrar la asignación' }
  }

  revalidarRutasLeads()
  return { ok: true }
}

/**
 * «Tomar lead» del escalamiento abierto (paso 30 min): el PRIMER asesor que
 * lo toma se lo queda; los demás ven «ya fue tomado».
 *
 * El candado es compare-and-swap sobre el asesor VIGENTE
 * (`.eq('asesor_id', asesorOriginal)`) — NO el `.is('asesor_id', null)` de
 * bandeja, porque aquí el lead SÍ tiene asesor asignado por guardia. Si dos
 * asesores tocan «Tomar» a la vez, el segundo update no afecta filas.
 *
 * NO detiene el escalamiento: tomarlo no es contestarlo. El paso de 2 h al
 * dueño sigue corriendo hasta que alguien marque contactado o registre un
 * seguimiento manual (decisión 3 del spec de guardias).
 */
export async function tomarLead(leadId: string): Promise<ResultadoAccion> {
  const usuario = await requireAsesor()
  const supabase = createAdminClient()

  const lead = await leadEnEscalamientoAbierto(supabase, leadId)
  if (!lead) return { error: 'Este lead ya no está en escalamiento abierto' }
  if (lead.asesor_id === usuario.user_id) return { error: 'Este lead ya es tuyo' }

  const { data: actualizados, error } = await supabase
    .from('leads')
    .update({ asesor_id: usuario.user_id, asignado_en: new Date().toISOString() })
    .eq('id', leadId)
    .eq('asesor_id', lead.asesor_id)
    .eq('etapa', 'nuevo')
    .eq('archivado', false)
    .select('id, nombre')

  if (error) return { error: `No se pudo tomar el lead: ${error.message}` }
  if (!actualizados?.[0]) return { error: 'Este lead ya fue tomado' }

  // El trigger de leads emitirá además 'lead_asignado' por el cambio de
  // asesor_id — intencional: la UI colapsa ambos en una sola línea.
  await registrarEvento(supabase, leadId, 'tomado_de_bandeja', {}, usuario.user_id)

  // Best-effort documentado: la toma ya quedó persistida; si el registro
  // falla se reporta sin deshacerla (mismo criterio que registrarAsignacion).
  try {
    const { error: errorSeguimiento } = await supabase.from('seguimientos').insert({
      lead_id: leadId,
      autor_id: usuario.user_id,
      tipo: 'sistema',
      nota: `${usuario.nombre} tomó el lead desde el escalamiento abierto`,
    })
    if (errorSeguimiento) {
      throw new Error(`No se pudo registrar el seguimiento: ${errorSeguimiento.message}`)
    }

    if (lead.asesor_id) {
      await crearNotificacion(supabase, {
        destinatarioId: lead.asesor_id,
        tipo: 'lead_asignado',
        texto: `${usuario.nombre} tomó tu lead ${lead.nombre} del escalamiento`,
        url: '/asesor/leads',
      })
    }
  } catch (e) {
    revalidarRutasLeads()
    return { error: e instanceof Error ? e.message : 'Error al registrar la toma del lead' }
  }

  revalidarRutasLeads()
  revalidatePath('/asesor/leads')
  revalidatePath(`/asesor/leads/${leadId}`)
  return { ok: true }
}

/**
 * Reasigna un lead a otro asesor (aplica tenga o no asesor actual).
 *
 * Mueve también las visitas FUTURAS y aún `agendada` del lead al nuevo
 * asesor. Sin esto, `visitas.asesor_id` se queda apuntando al asesor
 * anterior: la policy de `visitas` (owner-or-admin, migración 0002) sigue
 * dejando pasar la fila al asesor viejo, pero el embed `lead:leads(...)`
 * que arma el dashboard sí lo bloquea la RLS de `leads` (ya no es su lead)
 * → llega `lead: null` y se pinta una fila en blanco con link roto a
 * `/asesor/leads/` (sin id). El asesor nuevo, mientras tanto, no ve la
 * visita en absoluto. Y no hay forma de corregirlo desde la app: el grant
 * de columna de UPDATE de `authenticated` sobre `visitas` (migración 0009)
 * no incluye `asesor_id` a propósito — por eso este arreglo vive aquí, con
 * `createAdminClient()` (service-role), igual que el resto de la función.
 *
 * Las visitas PASADAS o ya `realizada`/`cancelada` NO se tocan: quedan como
 * registro histórico de quién realmente atendió/canceló esa visita en su
 * momento, que es información real y no debe reescribirse solo porque el
 * lead cambió de dueño hoy.
 */
export async function reasignarLead(
  leadId: string,
  nuevoAsesorId: string
): Promise<ResultadoAccion> {
  const admin = await requireAdmin()
  const supabase = createAdminClient()

  const asesor = await obtenerAsesorActivo(supabase, nuevoAsesorId)
  if (!asesor) return { error: 'El asesor no está disponible' }

  const { data: actualizados, error } = await supabase
    .from('leads')
    .update({ asesor_id: nuevoAsesorId, asignado_en: new Date().toISOString() })
    .eq('id', leadId)
    .select('id, nombre')

  if (error) return { error: `No se pudo reasignar el lead: ${error.message}` }
  const lead = actualizados?.[0]
  if (!lead) return { error: 'No se encontró el lead' }

  const { error: errorVisitas } = await supabase
    .from('visitas')
    .update({ asesor_id: nuevoAsesorId })
    .eq('lead_id', leadId)
    .eq('estado', 'agendada')
    .gt('fecha', new Date().toISOString())

  if (errorVisitas) {
    revalidarRutasLeads()
    return {
      error: `El lead se reasignó, pero no se pudieron mover sus visitas agendadas: ${errorVisitas.message}`,
    }
  }

  try {
    await registrarAsignacion(supabase, {
      leadId,
      leadNombre: lead.nombre,
      asesorId: nuevoAsesorId,
      asesorNombre: asesor.nombre,
      admin,
      reasignacion: true,
    })
  } catch (e) {
    revalidarRutasLeads()
    return { error: e instanceof Error ? e.message : 'Error al registrar la reasignación' }
  }

  revalidarRutasLeads()
  return { ok: true }
}

export type DatosCapturarLead = {
  nombre: string
  telefono: string
  email?: string | null
  fuente: string
  propiedadId?: string | null
  asesorId?: string | null
}

/**
 * Captura manual de un lead por un admin (walk-in, llamada, referido…).
 * Sin asesorId el lead cae a la bandeja; con asesorId queda asignado de
 * inmediato (con seguimiento y notificación como en asignarLead).
 *
 * El teléfono se normaliza con normalizarTelefono (52XXXXXXXXXX), el MISMO
 * formato que usa el sync de EasyBroker: así el dedup por teléfono compara
 * peras con peras.
 */
export async function capturarLead(datos: DatosCapturarLead): Promise<ResultadoAccion> {
  const admin = await requireAdmin()

  const nombre = datos.nombre?.trim()
  if (!nombre) return { error: 'El nombre es obligatorio' }

  const telefono = normalizarTelefono(datos.telefono)
  if (!telefono) return { error: 'El teléfono es obligatorio' }
  if (telefono.length !== 12) return { error: 'El teléfono debe tener 10 dígitos' }

  const email = datos.email?.trim().toLowerCase() || null

  if (!(FUENTES_LEAD as readonly string[]).includes(datos.fuente)) {
    return { error: 'La fuente no es válida' }
  }
  const fuente = datos.fuente as FuenteLead

  const supabase = createAdminClient()

  // Dedup por teléfono normalizado entre leads no archivados.
  const { data: duplicado, error: errorDup } = await supabase
    .from('leads')
    .select('nombre')
    .eq('telefono', telefono)
    .eq('archivado', false)
    .limit(1)
    .maybeSingle()

  if (errorDup) return { error: `No se pudo verificar duplicados: ${errorDup.message}` }
  if (duplicado) return { error: `Ya existe un lead con ese teléfono: ${duplicado.nombre}` }

  const asesorId = datos.asesorId || null
  let asesorNombre: string | null = null
  if (asesorId) {
    const asesor = await obtenerAsesorActivo(supabase, asesorId)
    if (!asesor) return { error: 'El asesor no está disponible' }
    asesorNombre = asesor.nombre
  }

  // Prefill de zona de interés desde la propiedad (colonia, ciudad).
  let propiedadId: string | null = null
  let zonaInteres: string | null = null
  if (datos.propiedadId) {
    const { data: propiedad, error: errorPropiedad } = await supabase
      .from('propiedades')
      .select('id, colonia, ciudad')
      .eq('id', datos.propiedadId)
      .maybeSingle()

    if (errorPropiedad || !propiedad) {
      return { error: 'La propiedad seleccionada no existe' }
    }
    propiedadId = propiedad.id
    zonaInteres = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ') || null
  }

  const { data: creado, error: errorInsertar } = await supabase
    .from('leads')
    .insert({
      agencia_id: admin.agencia_id,
      nombre,
      telefono,
      email,
      fuente,
      propiedad_id: propiedadId,
      zona_interes: zonaInteres,
      asesor_id: asesorId,
      asignado_en: asesorId ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (errorInsertar || !creado) {
    return { error: `No se pudo registrar el lead: ${errorInsertar?.message ?? 'error desconocido'}` }
  }

  if (asesorId && asesorNombre) {
    try {
      await registrarAsignacion(supabase, {
        leadId: creado.id,
        leadNombre: nombre,
        asesorId,
        asesorNombre,
        admin,
        reasignacion: false,
      })
    } catch (e) {
      revalidarRutasLeads()
      return { error: e instanceof Error ? e.message : 'Error al registrar la asignación' }
    }
  }

  revalidarRutasLeads()
  return { ok: true }
}
