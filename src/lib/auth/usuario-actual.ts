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

/**
 * Exige acceso a las superficies del asesor; si no, redirige al login.
 *
 * Un admin TAMBIÉN pasa, a propósito: la dirección necesita poder pararse en
 * la vista del asesor para verificar el producto tal como lo ve el equipo (el
 * switcher vive en el shell, ver `components/nav/cambiar-vista.tsx`). Esto NO
 * es impersonación: el usuario devuelto es él mismo, así que todo lo que
 * escriba queda registrado con su propio `user_id` y el histórico sigue
 * diciendo la verdad sobre quién hizo qué.
 *
 * CUIDADO al escribir consultas para estas pantallas: NO basta con confiar en
 * RLS para el ownership. Un admin pasa `private.is_admin()` (0002_rls.sql:17),
 * así que RLS no lo filtra — hay que acotar explícitamente con
 * `.eq('asesor_id', usuario.user_id)`. Sin eso, una pantalla que dice «tus
 * leads» le mostraría los de toda la agencia.
 */
export async function requireAsesor(): Promise<UsuarioActual> {
  const usuario = await usuarioActual()
  if (!usuario || (usuario.rol !== 'asesor' && usuario.rol !== 'admin')) {
    redirect('/login')
  }
  return usuario
}
