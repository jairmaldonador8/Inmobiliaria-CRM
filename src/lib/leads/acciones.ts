'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'

import { requireAdmin, type UsuarioActual } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearNotificacion } from '@/lib/notificaciones/crear'
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
 * Reasigna un lead a otro asesor (aplica tenga o no asesor actual).
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
