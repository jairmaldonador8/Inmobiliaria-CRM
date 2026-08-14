'use server'

/**
 * Acciones de captaciones.
 *
 * Lado asesor (cliente de SESIÓN: RLS garantiza que solo toca las suyas y
 * solo en borrador/regresada — «0 filas afectadas» = no era suya o no estaba
 * en su cancha):
 *   - guardarCaptacion (crea o actualiza el borrador)
 *   - enviarCaptacion  (borrador/regresada → enviada)
 *   - eliminarCaptacion (solo borradores)
 *
 * Lado admin (admin client: regresar y cargar tocan columnas server-managed
 * que los grants de columna no exponen a authenticated):
 *   - regresarCaptacion (enviada → regresada, con comentario)
 *   - cargarCaptacionEB (enviada → cargada: POST /v1/properties de EasyBroker)
 */
import { revalidatePath } from 'next/cache'

import { requireAdmin, requireAsesor } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { crearNotificacion, notificarAdmins } from '@/lib/notificaciones/crear'
import { enviarPush } from '@/lib/push/enviar'
import { ebFetch, ebPost, EasyBrokerError } from '@/lib/easybroker/cliente'
import { evaluarCaptacion, type DatosScoreCaptacion } from '@/lib/captaciones/score'
import { armarPayloadEB, inicialesDeNombre, type CaptacionParaEB } from '@/lib/captaciones/payload-eb'
import type { Captacion, FotoCaptacion } from '@/lib/captaciones/consultas'

export type ResultadoCaptacion = { ok: true; id: string } | { error: string }

const RUTA_ASESOR = '/asesor/captaciones'
const RUTA_ADMIN = '/admin/captaciones'

/** Campos editables por el asesor (serializables tal cual desde el cliente). */
export interface CamposCaptacion {
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
}

function texto(valor: unknown, max = 5000): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio ? limpio.slice(0, max) : null
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Normaliza los campos crudos del formulario a la fila de la tabla. */
function normalizarCampos(campos: CamposCaptacion) {
  const fotos = Array.isArray(campos.fotos)
    ? campos.fotos
        .filter((f) => f && typeof f.url === 'string' && typeof f.path === 'string')
        .slice(0, 50)
        .map((f) => ({ url: f.url, path: f.path }))
    : []

  return {
    titulo: texto(campos.titulo, 200) ?? '',
    descripcion: texto(campos.descripcion, 8000) ?? '',
    tipo: texto(campos.tipo, 60),
    operacion: campos.operacion === 'sale' || campos.operacion === 'rental' ? campos.operacion : null,
    precio: numero(campos.precio),
    moneda: campos.moneda === 'USD' ? 'USD' : 'MXN',
    colonia: texto(campos.colonia, 120),
    ciudad: texto(campos.ciudad, 120),
    entidad: texto(campos.entidad, 120) ?? 'Nuevo León',
    calle: texto(campos.calle, 160),
    numero_exterior: texto(campos.numero_exterior, 20),
    codigo_postal: texto(campos.codigo_postal, 10),
    lat: campos.lat === null ? null : numero(campos.lat) ?? null,
    lng: campos.lng === null || campos.lng === undefined ? null : Number.isFinite(Number(campos.lng)) ? Number(campos.lng) : null,
    mostrar_ubicacion_exacta: campos.mostrar_ubicacion_exacta === true,
    recamaras: numero(campos.recamaras),
    banos: numero(campos.banos),
    medios_banos: numero(campos.medios_banos),
    estacionamientos: numero(campos.estacionamientos),
    antiguedad: numero(campos.antiguedad),
    m2_construccion: numero(campos.m2_construccion),
    m2_terreno: numero(campos.m2_terreno),
    video_url: texto(campos.video_url, 300),
    tour_url: texto(campos.tour_url, 300),
    fotos,
    actualizado_en: new Date().toISOString(),
  }
}

/** Crea (id null) o actualiza el borrador del asesor. */
export async function guardarCaptacion(
  id: string | null,
  campos: CamposCaptacion
): Promise<ResultadoCaptacion> {
  const usuario = await requireAsesor()
  const supabase = await createClient()
  const fila = normalizarCampos(campos)

  if (!id) {
    const { data, error } = await supabase
      .from('captaciones')
      .insert({
        agencia_id: usuario.agencia_id,
        asesor_id: usuario.user_id,
        estado: 'borrador',
        ...fila,
      })
      .select('id')
      .single()
    if (error || !data) {
      return { error: `No se pudo crear la captación: ${error?.message ?? 'error desconocido'}` }
    }
    revalidatePath(RUTA_ASESOR)
    return { ok: true, id: data.id }
  }

  const { data, error } = await supabase
    .from('captaciones')
    .update(fila)
    .eq('id', id)
    .eq('asesor_id', usuario.user_id) // el admin en vista asesor pasa RLS: acotar a mano
    .select('id')
  if (error) return { error: `No se pudo guardar: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Esta captación ya no se puede editar (¿está enviada o cargada?).' }
  }
  revalidatePath(RUTA_ASESOR)
  return { ok: true, id }
}

/** El asesor manda la captación a revisión del admin. */
export async function enviarCaptacion(id: string): Promise<ResultadoCaptacion> {
  const usuario = await requireAsesor()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('captaciones')
    .update({ estado: 'enviada', actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('asesor_id', usuario.user_id)
    .select('id, titulo')
  if (error) return { error: `No se pudo enviar: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Solo se pueden enviar captaciones en borrador o regresadas.' }
  }

  // Aviso a admins: best-effort, jamás revierte el envío.
  try {
    const admin = createAdminClient()
    await notificarAdmins(admin, {
      tipo: 'captacion_enviada',
      texto: `${usuario.nombre} envió la captación «${data[0].titulo || 'Sin título'}» a revisión`,
      url: `${RUTA_ADMIN}/${id}`,
    })
  } catch (error) {
    console.error('[captaciones] aviso a admins falló:', error)
  }

  revalidatePath(RUTA_ASESOR)
  revalidatePath(RUTA_ADMIN)
  return { ok: true, id }
}

/** El asesor elimina un borrador (las fotos del bucket se limpian best-effort). */
export async function eliminarCaptacion(id: string): Promise<ResultadoCaptacion> {
  const usuario = await requireAsesor()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('captaciones')
    .delete()
    .eq('id', id)
    .eq('asesor_id', usuario.user_id)
    .select('id, fotos')
  if (error) return { error: `No se pudo eliminar: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Solo se pueden eliminar borradores.' }
  }

  const rutas = ((data[0].fotos ?? []) as FotoCaptacion[]).map((f) => f.path).filter(Boolean)
  if (rutas.length > 0) {
    try {
      await createAdminClient().storage.from('captaciones').remove(rutas)
    } catch (error) {
      console.error('[captaciones] limpieza de fotos falló:', error)
    }
  }

  revalidatePath(RUTA_ASESOR)
  return { ok: true, id }
}

/** El admin regresa la captación al asesor con comentarios. */
export async function regresarCaptacion(id: string, comentario: string): Promise<ResultadoCaptacion> {
  const admin = await requireAdmin()
  const nota = texto(comentario, 2000)
  if (!nota) return { error: 'Escribe qué debe corregir el asesor.' }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('captaciones')
    .update({ estado: 'regresada', comentario_admin: nota, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'enviada')
    .select('id, titulo, asesor_id')
  if (error) return { error: `No se pudo regresar: ${error.message}` }
  if (!data || data.length === 0) {
    return { error: 'Solo se pueden regresar captaciones enviadas.' }
  }

  const captacion = data[0]
  try {
    await crearNotificacion(supabase, {
      destinatarioId: captacion.asesor_id,
      tipo: 'captacion_regresada',
      texto: `Tu captación «${captacion.titulo || 'Sin título'}» regresó con comentarios de ${admin.nombre}`,
      url: RUTA_ASESOR,
    })
    await enviarPush(supabase, captacion.asesor_id, {
      titulo: 'Captación con comentarios',
      cuerpo: `«${captacion.titulo || 'Sin título'}» necesita ajustes — revísala`,
      url: RUTA_ASESOR,
    })
  } catch (error) {
    console.error('[captaciones] aviso al asesor falló:', error)
  }

  revalidatePath(RUTA_ADMIN)
  revalidatePath(RUTA_ASESOR)
  return { ok: true, id }
}

/** Forma de la respuesta del POST /v1/properties (solo lo que usamos). */
interface RespuestaCrearPropiedadEB {
  public_id?: string
  property?: { public_id?: string }
}

/** Nodo del árbol de GET /v1/locations. */
interface UbicacionEB {
  name?: string
  full_name?: string
  type?: string
  localities?: UbicacionEB[]
}

function sinAcentos(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Resuelve la colonia contra el catálogo de EasyBroker ANTES de cargar: su
 * API rechaza cualquier location.name que no exista tal cual en /v1/locations
 * (verificado contra el sandbox 2026-08-14). Si la colonia no está, se
 * regresa un error con las colonias parecidas del catálogo para que el admin
 * corrija sin adivinar. Si /locations falla (red), se deja pasar el nombre
 * armado a mano y EB da el veredicto final.
 */
async function resolverNombreUbicacionEB(
  colonia: string,
  ciudad: string,
  entidad: string
): Promise<{ nombre: string } | { error: string }> {
  let raiz: UbicacionEB
  try {
    raiz = await ebFetch<UbicacionEB>('/v1/locations', { query: `${ciudad}, ${entidad}` })
  } catch (error) {
    console.warn('[captaciones] /v1/locations falló; EB validará la ubicación:', error)
    return { nombre: `${colonia}, ${ciudad}, ${entidad}` }
  }

  if (raiz.type !== 'City' || !Array.isArray(raiz.localities)) {
    return {
      error: `EasyBroker no reconoce la ciudad «${ciudad}, ${entidad}» — revisa la ortografía contra su catálogo.`,
    }
  }

  const buscada = sinAcentos(colonia)
  const exacta = raiz.localities.find((l) => sinAcentos(l.name ?? '') === buscada)
  if (exacta?.full_name) return { nombre: exacta.full_name }

  const parecidas = raiz.localities
    .filter((l) => {
      const nombre = sinAcentos(l.name ?? '')
      return nombre.includes(buscada) || buscada.includes(nombre)
    })
    .slice(0, 5)
    .map((l) => l.name)
    .filter(Boolean)

  return {
    error:
      `La colonia «${colonia}» no está en el catálogo de EasyBroker para ${ciudad}.` +
      (parecidas.length > 0
        ? ` ¿Será alguna de estas? ${parecidas.join(' · ')}`
        : ' Corrige la colonia en la captación (regresándosela al asesor) e intenta de nuevo.'),
  }
}

/**
 * El admin aprueba y CARGA la captación a EasyBroker con un click.
 * `publicar` = switch maestro: true publica (y sindica a los portales
 * activos del App Directory de EB); false la sube apagada (not_published).
 */
export async function cargarCaptacionEB(id: string, publicar: boolean): Promise<ResultadoCaptacion> {
  const admin = await requireAdmin()
  const supabase = createAdminClient()

  const { data: captacion, error } = await supabase
    .from('captaciones')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !captacion) {
    return { error: `No se encontró la captación: ${error?.message ?? 'sin filas'}` }
  }
  const fila = captacion as Captacion
  if (fila.estado !== 'enviada') {
    return { error: 'Solo se cargan captaciones enviadas a revisión.' }
  }

  // La misma vara que ve el asesor: sin bloqueantes no hay carga.
  const score = evaluarCaptacion(comoDatosScore(fila))
  if (!score.publicable) {
    const pendiente = score.bloqueantes.find((b) => !b.cumple)
    return { error: `Falta un requisito: ${pendiente?.detalle ?? 'revisa el checklist'}` }
  }

  const { data: asesor } = await supabase
    .from('usuarios')
    .select('nombre')
    .eq('user_id', fila.asesor_id)
    .maybeSingle()
  const iniciales = inicialesDeNombre(asesor?.nombre ?? '')

  // La colonia se resuelve contra el catálogo de EB ANTES del POST: evita el
  // 422 más común y le da al admin la corrección exacta si no coincide.
  const ubicacion = await resolverNombreUbicacionEB(fila.colonia ?? '', fila.ciudad ?? '', fila.entidad)
  if ('error' in ubicacion) return { error: ubicacion.error }

  const payload = armarPayloadEB(
    comoCaptacionEB(fila),
    iniciales,
    publicar,
    new Date().getFullYear(),
    ubicacion.nombre
  )

  let publicId: string
  try {
    const respuesta = await ebPost<RespuestaCrearPropiedadEB>('/v1/properties', payload)
    const devuelto = respuesta.public_id ?? respuesta.property?.public_id
    if (!devuelto) {
      return { error: 'EasyBroker aceptó la carga pero no devolvió el ID; revísala en EasyBroker antes de reintentar.' }
    }
    publicId = devuelto
  } catch (error) {
    if (error instanceof EasyBrokerError) {
      return { error: `EasyBroker rechazó la carga (${error.status}): ${error.cuerpo.slice(0, 300)}` }
    }
    return { error: `No se pudo cargar a EasyBroker: ${error instanceof Error ? error.message : String(error)}` }
  }

  const { error: errorUpdate } = await supabase
    .from('captaciones')
    .update({
      estado: 'cargada',
      easybroker_id: publicId,
      cargada_en: new Date().toISOString(),
      cargada_por: admin.user_id,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', id)
  if (errorUpdate) {
    // La propiedad YA existe en EB: reportarlo con el id para no duplicarla.
    return {
      error: `La propiedad quedó en EasyBroker como ${publicId}, pero no se pudo marcar aquí: ${errorUpdate.message}. NO vuelvas a cargarla; contacta soporte.`,
    }
  }

  try {
    await crearNotificacion(supabase, {
      destinatarioId: fila.asesor_id,
      tipo: 'captacion_cargada',
      texto: `Tu captación «${fila.titulo}» ya está en EasyBroker (${publicId})${publicar ? ' y publicada en portales' : ', apagada'}`,
      url: RUTA_ASESOR,
    })
    await enviarPush(supabase, fila.asesor_id, {
      titulo: publicar ? 'Captación publicada' : 'Captación cargada',
      cuerpo: `«${fila.titulo}» ya vive en EasyBroker (${publicId})`,
      url: RUTA_ASESOR,
    })
  } catch (error) {
    console.error('[captaciones] aviso de carga falló:', error)
  }

  revalidatePath(RUTA_ADMIN)
  revalidatePath(RUTA_ASESOR)
  return { ok: true, id }
}

// ---------------------------------------------------------------------------
// Adaptadores fila → tipos de score/payload
// ---------------------------------------------------------------------------

function comoDatosScore(c: Captacion): DatosScoreCaptacion {
  return {
    titulo: c.titulo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    operacion: c.operacion,
    precio: c.precio,
    colonia: c.colonia,
    ciudad: c.ciudad,
    calle: c.calle,
    lat: c.lat,
    lng: c.lng,
    recamaras: c.recamaras,
    banos: c.banos,
    medios_banos: c.medios_banos,
    estacionamientos: c.estacionamientos,
    antiguedad: c.antiguedad,
    m2_construccion: c.m2_construccion,
    m2_terreno: c.m2_terreno,
    video_url: c.video_url,
    tour_url: c.tour_url,
    fotos: (c.fotos ?? []).length,
    mostrar_ubicacion_exacta: c.mostrar_ubicacion_exacta,
  }
}

function comoCaptacionEB(c: Captacion): CaptacionParaEB {
  return {
    titulo: c.titulo,
    descripcion: c.descripcion,
    tipo: c.tipo ?? '',
    operacion: c.operacion ?? 'sale',
    precio: c.precio ?? 0,
    moneda: c.moneda,
    colonia: c.colonia ?? '',
    ciudad: c.ciudad ?? '',
    estado: c.entidad,
    calle: c.calle,
    numero_exterior: c.numero_exterior,
    codigo_postal: c.codigo_postal,
    lat: c.lat,
    lng: c.lng,
    mostrar_ubicacion_exacta: c.mostrar_ubicacion_exacta,
    recamaras: c.recamaras,
    banos: c.banos,
    medios_banos: c.medios_banos,
    estacionamientos: c.estacionamientos,
    antiguedad: c.antiguedad,
    m2_construccion: c.m2_construccion,
    m2_terreno: c.m2_terreno,
    video_url: c.video_url,
    tour_url: c.tour_url,
    fotos: (c.fotos ?? []).map((f) => f.url),
  }
}
