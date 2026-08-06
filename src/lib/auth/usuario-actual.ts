import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export type Rol = 'admin' | 'asesor'

export type UsuarioActual = {
  user_id: string
  agencia_id: string
  rol: Rol
  nombre: string
  telefono: string | null
  foto: string | null
  activo: boolean
}

/**
 * Usuario autenticado actual, o null si no hay sesión válida.
 *
 * Memoizado con React cache(): dentro de un mismo render (layout + page)
 * solo consulta una vez.
 *
 * IMPORTANTE: el proxy NO es frontera de seguridad — solo conveniencia de
 * redirección. Esta función (vía requireAdmin/requireAsesor en cada
 * layout) es la verificación real por petición: valida el JWT con
 * getClaims y re-consulta la fila en `usuarios` para confirmar rol y
 * que la cuenta siga activa.
 */
export const usuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) {
    return null
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('user_id, agencia_id, rol, nombre, telefono, foto, activo')
    .eq('user_id', data.claims.sub)
    .maybeSingle()

  if (!usuario || !usuario.activo) {
    return null
  }

  return usuario as UsuarioActual
})

/** Exige sesión de admin; si no, redirige al login. */
export async function requireAdmin(): Promise<UsuarioActual> {
  const usuario = await usuarioActual()
  if (!usuario || usuario.rol !== 'admin') {
    redirect('/login')
  }
  return usuario
}

/** Exige sesión de asesor; si no, redirige al login. */
export async function requireAsesor(): Promise<UsuarioActual> {
  const usuario = await usuarioActual()
  if (!usuario || usuario.rol !== 'asesor') {
    redirect('/login')
  }
  return usuario
}
