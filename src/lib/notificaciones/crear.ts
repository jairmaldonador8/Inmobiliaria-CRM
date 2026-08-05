/**
 * Creacion de notificaciones internas. Las escrituras en `notificaciones`
 * requieren service-role (no hay policy de INSERT para authenticated), por lo
 * que estas funciones reciben el cliente por parametro (inyeccion de
 * dependencias): el cron pasa el admin client y los tests el suyo.
 *
 * Ademas de la campanita, cada notificacion empuja Web Push (enviarPush) al
 * mismo destinatario. enviarPush ya tiene el contrato "nunca lanza", pero se
 * envuelve en try/catch igual (defensa en profundidad: sus internals podrian
 * cambiar) para que un fallo de push jamas tumbe la escritura de la
 * notificacion, que es la fuente de verdad.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/enviar'

export interface DatosNotificacion {
  destinatarioId: string
  tipo: string
  texto: string
  url?: string | null
}

/** Inserta una notificacion para un destinatario especifico y le empuja Web Push. */
export async function crearNotificacion(
  supabase: SupabaseClient,
  { destinatarioId, tipo, texto, url }: DatosNotificacion
): Promise<void> {
  const { error } = await supabase.from('notificaciones').insert({
    destinatario_id: destinatarioId,
    tipo,
    texto,
    url: url ?? null,
  })
  if (error) throw new Error(`No se pudo crear la notificación: ${error.message}`)

  try {
    await enviarPush(supabase, destinatarioId, { titulo: 'Klo-Ser', cuerpo: texto, url })
  } catch (err) {
    console.error('crearNotificacion: fallo el push, se omite', err)
  }
}

/**
 * Inserta la misma notificacion para TODOS los admins activos (bulk insert) y
 * le empuja Web Push a cada uno. Devuelve cuantas notificaciones se crearon.
 */
export async function notificarAdmins(
  supabase: SupabaseClient,
  { tipo, texto, url }: Omit<DatosNotificacion, 'destinatarioId'>
): Promise<number> {
  const { data: admins, error } = await supabase
    .from('usuarios')
    .select('user_id')
    .eq('rol', 'admin')
    .eq('activo', true)
  if (error) throw new Error(`No se pudieron obtener los admins: ${error.message}`)
  if (!admins || admins.length === 0) return 0

  const filas = admins.map((admin) => ({
    destinatario_id: admin.user_id,
    tipo,
    texto,
    url: url ?? null,
  }))
  const { error: insertError } = await supabase.from('notificaciones').insert(filas)
  if (insertError) {
    throw new Error(`No se pudieron crear las notificaciones para admins: ${insertError.message}`)
  }

  for (const admin of admins) {
    try {
      await enviarPush(supabase, admin.user_id, { titulo: 'Klo-Ser', cuerpo: texto, url })
    } catch (err) {
      console.error('notificarAdmins: fallo el push, se omite', err)
    }
  }

  return filas.length
}
