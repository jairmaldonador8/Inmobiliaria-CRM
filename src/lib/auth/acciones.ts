'use server'

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

export type EstadoLogin = { error: string } | null

/**
 * Server Action de inicio de sesión (para useActionState).
 *
 * En éxito redirige al área del rol según el claim `user_role` (inyectado
 * por el auth hook). Una cuenta autenticable pero sin rol (sin fila en
 * `usuarios`) se cierra de inmediato con mensaje claro.
 */
export async function iniciarSesion(
  _estadoAnterior: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: 'Correo o contraseña incorrectos' }
  }

  const { data } = await supabase.auth.getClaims()
  const rol = data?.claims?.user_role

  if (rol === 'admin') {
    redirect('/admin')
  }
  if (rol === 'asesor') {
    redirect('/asesor')
  }

  // Autenticado pero sin rol: no tiene perfil en `usuarios`.
  await supabase.auth.signOut({ scope: 'local' })
  return { error: 'Tu cuenta no tiene acceso. Contacta al administrador.' }
}

/** Cierra la sesión del navegador actual y regresa al login. */
export async function cerrarSesion(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}
