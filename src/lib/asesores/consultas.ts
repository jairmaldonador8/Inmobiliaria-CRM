/**
 * Consultas de asesores para la vista admin.
 *
 * Usa el cliente admin (service-role): la página que la llama ya verificó
 * la sesión con requireAdmin().
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLES_QUE_ASESORAN } from '@/lib/asesores/roles'

/** Etapas que ya no cuentan como trabajo activo del asesor. */
const ETAPAS_CERRADAS = ['cerrado_ganado', 'cerrado_perdido']

export type FilaAsesor = {
  userId: string
  nombre: string
  email: string
  telefono: string | null
  rol: string
  activo: boolean
  leadsActivos: number
  tienePush: boolean
}

/**
 * Lista de asesores para la vista admin, con conteo de leads activos y si
 * tienen al menos una suscripción push registrada (Task 9: para el badge
 * "Sin notificaciones" — solo informativo, no distingue cuántos
 * dispositivos).
 */
export async function obtenerAsesores(): Promise<FilaAsesor[]> {
  const supabase = createAdminClient()

  const { data: usuarios } = await supabase
    .from('usuarios')
    .select('user_id, nombre, telefono, rol, activo, creado_en')
    .in('rol', ROLES_QUE_ASESORAN)
    .order('creado_en', { ascending: true })

  const asesores = usuarios ?? []
  if (asesores.length === 0) return []

  const ids = asesores.map((a) => a.user_id)

  // Las 3 consultas de abajo son mutuamente independientes (ninguna depende
  // del resultado de otra) — se disparan en paralelo con Promise.all en vez
  // de 3 round-trips secuenciales.
  const [{ data: leadsActivos }, { data: suscripciones }, { data: listado }] = await Promise.all([
    // Conteo de leads activos por asesor: una sola consulta filtrada,
    // agregada en memoria (no hay `group by` directo en supabase-js).
    supabase
      .from('leads')
      .select('asesor_id')
      .in('asesor_id', ids)
      .eq('archivado', false)
      .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`),
    // Quién tiene push: una sola consulta con TODOS los ids (evita N+1),
    // membresía por Set en JS.
    supabase.from('push_suscripciones').select('usuario_id').in('usuario_id', ids),
    // El correo no vive en `usuarios`: se obtiene de auth.admin.listUsers()
    // y se mapea por id. Suficiente a esta escala (decenas de asesores).
    supabase.auth.admin.listUsers({ perPage: 200 }),
  ])

  const conteoPorAsesor = new Map<string, number>()
  for (const lead of leadsActivos ?? []) {
    if (!lead.asesor_id) continue
    conteoPorAsesor.set(lead.asesor_id, (conteoPorAsesor.get(lead.asesor_id) ?? 0) + 1)
  }

  const idsConPush = new Set((suscripciones ?? []).map((s) => s.usuario_id))

  const emailPorId = new Map((listado?.users ?? []).map((u) => [u.id, u.email ?? '—']))

  return asesores.map((a) => ({
    userId: a.user_id,
    nombre: a.nombre,
    email: emailPorId.get(a.user_id) ?? '—',
    telefono: a.telefono,
    rol: a.rol,
    activo: a.activo,
    leadsActivos: conteoPorAsesor.get(a.user_id) ?? 0,
    tienePush: idsConPush.has(a.user_id),
  }))
}
