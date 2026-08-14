/**
 * Consultas de captaciones. Cliente por parámetro (DI), igual que el resto
 * de src/lib: las páginas pasan el cliente de sesión (RLS filtra) y las
 * acciones de admin pasan el admin client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface FotoCaptacion {
  url: string
  path: string
}

export interface Captacion {
  id: string
  agencia_id: string
  asesor_id: string
  estado: 'borrador' | 'enviada' | 'regresada' | 'cargada'
  titulo: string
  descripcion: string
  tipo: string | null
  operacion: 'sale' | 'rental' | null
  precio: number | null
  moneda: string
  colonia: string | null
  ciudad: string | null
  entidad: string
  calle: string | null
  numero_exterior: string | null
  codigo_postal: string | null
  lat: number | null
  lng: number | null
  mostrar_ubicacion_exacta: boolean
  recamaras: number | null
  banos: number | null
  medios_banos: number | null
  estacionamientos: number | null
  antiguedad: number | null
  m2_construccion: number | null
  m2_terreno: number | null
  video_url: string | null
  tour_url: string | null
  fotos: FotoCaptacion[]
  comentario_admin: string | null
  easybroker_id: string | null
  cargada_en: string | null
  creado_en: string
  actualizado_en: string
}

export interface CaptacionConAsesor extends Captacion {
  asesor_nombre: string
}

const COLUMNAS =
  'id, agencia_id, asesor_id, estado, titulo, descripcion, tipo, operacion, precio, moneda, ' +
  'colonia, ciudad, entidad, calle, numero_exterior, codigo_postal, lat, lng, ' +
  'mostrar_ubicacion_exacta, recamaras, banos, medios_banos, estacionamientos, antiguedad, ' +
  'm2_construccion, m2_terreno, video_url, tour_url, fotos, comentario_admin, easybroker_id, ' +
  'cargada_en, creado_en, actualizado_en'

/** Las captaciones del asesor, recientes primero. */
export async function captacionesDeAsesor(
  supabase: SupabaseClient,
  asesorId: string
): Promise<Captacion[]> {
  const { data, error } = await supabase
    .from('captaciones')
    .select(COLUMNAS)
    .eq('asesor_id', asesorId)
    .order('actualizado_en', { ascending: false })
  if (error) throw new Error(`captaciones del asesor: ${error.message}`)
  return (data ?? []) as unknown as Captacion[]
}

/** Todas las captaciones con el nombre del asesor (vista del admin). */
export async function captacionesParaAdmin(
  supabase: SupabaseClient
): Promise<CaptacionConAsesor[]> {
  const { data, error } = await supabase
    .from('captaciones')
    .select(`${COLUMNAS}, asesor:usuarios!captaciones_asesor_id_fkey(nombre)`)
    .order('actualizado_en', { ascending: false })
  if (error) throw new Error(`captaciones para admin: ${error.message}`)
  return (data ?? []).map((fila) => {
    const { asesor, ...resto } = fila as unknown as Captacion & { asesor: { nombre: string } | null }
    return { ...resto, asesor_nombre: asesor?.nombre ?? 'Asesor' }
  })
}

/** Una captación por id (RLS decide si el que consulta puede verla). */
export async function captacionPorId(
  supabase: SupabaseClient,
  id: string
): Promise<CaptacionConAsesor | null> {
  const { data, error } = await supabase
    .from('captaciones')
    .select(`${COLUMNAS}, asesor:usuarios!captaciones_asesor_id_fkey(nombre)`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`captación ${id}: ${error.message}`)
  if (!data) return null
  const { asesor, ...resto } = data as unknown as Captacion & { asesor: { nombre: string } | null }
  return { ...resto, asesor_nombre: asesor?.nombre ?? 'Asesor' }
}

/** Cuántas captaciones esperan revisión (para el badge del admin). */
export async function captacionesEnRevision(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('captaciones')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'enviada')
  if (error) throw new Error(`conteo de captaciones enviadas: ${error.message}`)
  return count ?? 0
}
