'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificarAdmins } from '@/lib/notificaciones/crear'

export type ResultadoAccion = { ok: true } | { error: string }

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Etapas que se consideran "cerradas": los leads en estas etapas NO vuelven
 * a la bandeja al desactivar a su asesor (ya son historia, no trabajo
 * pendiente).
 */
const ETAPAS_CERRADAS = ['cerrado_ganado', 'cerrado_perdido'] as const

type DatosCrearAsesor = {
  nombre: string
  email: string
  telefono?: string | null
  password: string
}

/**
 * Alta de un asesor: crea la cuenta en Supabase Auth (email confirmado, sin
 * flujo de verificación) y su fila en `usuarios`. Usa el cliente admin
 * (service-role) porque `auth.admin.createUser` y la escritura en
 * `usuarios` para otro usuario están fuera del alcance de RLS para un
 * usuario autenticado normal.
 */
export async function crearAsesor(datos: DatosCrearAsesor): Promise<ResultadoAccion> {
  await requireAdmin()

  const nombre = datos.nombre.trim()
  const email = datos.email.trim().toLowerCase()
  const telefono = datos.telefono?.trim() || null
  const password = datos.password

  if (!nombre) return { error: 'El nombre es obligatorio' }
  if (!email || !REGEX_EMAIL.test(email)) return { error: 'El correo no es válido' }
  if (!password || password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres' }
  }

  const supabase = createAdminClient()

  const { data: agencia, error: errorAgencia } = await supabase
    .from('agencias')
    .select('id')
    .order('creada_en', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (errorAgencia || !agencia) {
    return { error: 'No se encontró la agencia. Contacta a soporte.' }
  }

  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (errorCrear || !creado?.user) {
    if (errorCrear?.code === 'email_exists') {
      return { error: 'Ya existe un usuario con ese correo' }
    }
    return { error: `No se pudo crear la cuenta: ${errorCrear?.message ?? 'error desconocido'}` }
  }

  const { error: errorInsertar } = await supabase.from('usuarios').insert({
    user_id: creado.user.id,
    agencia_id: agencia.id,
    rol: 'asesor',
    nombre,
    telefono,
    activo: true,
  })

  if (errorInsertar) {
    // Evita cuentas huérfanas: si no se pudo crear la fila de perfil,
    // deshacemos la cuenta de auth recién creada.
    await supabase.auth.admin.deleteUser(creado.user.id)
    return { error: `No se pudo guardar el asesor: ${errorInsertar.message}` }
  }

  revalidatePath('/admin/asesores')
  return { ok: true }
}

/**
 * Desactiva a un asesor: bloquea su acceso (usuarioActual() lo trata como
 * inexistente), libera sus leads no cerrados de vuelta a la bandeja y
 * quita su responsabilidad sobre las propiedades asignadas. Notifica a los
 * demás admins.
 */
export async function desactivarAsesor(userId: string): Promise<ResultadoAccion> {
  await requireAdmin()

  const supabase = createAdminClient()

  const { data: asesor, error: errorAsesor } = await supabase
    .from('usuarios')
    .select('nombre, rol')
    .eq('user_id', userId)
    .maybeSingle()

  if (errorAsesor || !asesor || asesor.rol !== 'asesor') {
    return { error: 'No se encontró al asesor' }
  }

  const { error: errorUpdate } = await supabase
    .from('usuarios')
    .update({ activo: false })
    .eq('user_id', userId)

  if (errorUpdate) {
    return { error: `No se pudo desactivar: ${errorUpdate.message}` }
  }

  const { error: errorLeads } = await supabase
    .from('leads')
    .update({ asesor_id: null, asignado_en: null })
    .eq('asesor_id', userId)
    .eq('archivado', false)
    .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`)

  if (errorLeads) {
    return { error: `El asesor se desactivó, pero no se pudieron liberar sus leads: ${errorLeads.message}` }
  }

  const { error: errorPropiedades } = await supabase
    .from('propiedades')
    .update({ asesor_id: null })
    .eq('asesor_id', userId)

  if (errorPropiedades) {
    return {
      error: `El asesor se desactivó, pero no se pudieron liberar sus propiedades: ${errorPropiedades.message}`,
    }
  }

  await notificarAdmins(supabase, {
    tipo: 'asesor_desactivado',
    texto: `Se desactivó a ${asesor.nombre}; sus leads volvieron a la bandeja`,
    url: '/admin/bandeja',
  })

  revalidatePath('/admin/asesores')
  revalidatePath('/admin/bandeja')
  return { ok: true }
}

/** Reactiva a un asesor previamente desactivado. */
export async function reactivarAsesor(userId: string): Promise<ResultadoAccion> {
  await requireAdmin()

  const supabase = createAdminClient()

  const { data: asesor, error: errorAsesor } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('user_id', userId)
    .maybeSingle()

  if (errorAsesor || !asesor || asesor.rol !== 'asesor') {
    return { error: 'No se encontró al asesor' }
  }

  const { error } = await supabase
    .from('usuarios')
    .update({ activo: true })
    .eq('user_id', userId)

  if (error) {
    return { error: `No se pudo reactivar: ${error.message}` }
  }

  revalidatePath('/admin/asesores')
  return { ok: true }
}

type DatosActualizarAsesor = {
  nombre: string
  telefono?: string | null
}

/** Edita nombre y teléfono de un asesor existente. */
export async function actualizarAsesor(
  userId: string,
  datos: DatosActualizarAsesor
): Promise<ResultadoAccion> {
  await requireAdmin()

  const nombre = datos.nombre.trim()
  const telefono = datos.telefono?.trim() || null

  if (!nombre) return { error: 'El nombre es obligatorio' }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('usuarios')
    .update({ nombre, telefono })
    .eq('user_id', userId)
    .eq('rol', 'asesor')

  if (error) {
    return { error: `No se pudo actualizar: ${error.message}` }
  }

  revalidatePath('/admin/asesores')
  return { ok: true }
}
