import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { CloudDownload } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { filtroBusqueda } from '@/lib/propiedades/consultas'
import { ROLES_QUE_ASESORAN } from '@/lib/asesores/roles'
import { BotonSincronizar } from '@/components/propiedades/boton-sincronizar'
import { FiltrosPropiedades } from '@/components/propiedades/filtros-propiedades'
import {
  TarjetaPropiedadAdmin,
  type PropiedadTarjeta,
} from '@/components/propiedades/tarjeta-propiedad'

type SearchParams = {
  q?: string
  operacion?: string
  estatus?: string
  asesor?: string
}

type FilaPropiedad = PropiedadTarjeta & { asesor_id: string | null }

const CAMPOS_TARJETA =
  'id, titulo, operacion, estatus, precio, moneda, ubicacion, colonia, ciudad, recamaras, banos, estacionamientos, superficie_construccion, superficie_terreno, fotos, asesor_id'

export default async function PaginaPropiedadesAdmin({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAdmin()
  const filtros = await searchParams
  const supabase = createAdminClient()

  let consulta = supabase
    .from('propiedades')
    .select(CAMPOS_TARJETA)
    .eq('activa', true)
    .order('actualizada_eb', { ascending: false, nullsFirst: false })

  if (filtros.operacion === 'sale' || filtros.operacion === 'rental') {
    consulta = consulta.eq('operacion', filtros.operacion)
  }
  if (filtros.estatus) {
    consulta = consulta.eq('estatus', filtros.estatus)
  }
  if (filtros.asesor === 'sin') {
    consulta = consulta.is('asesor_id', null)
  } else if (filtros.asesor) {
    consulta = consulta.eq('asesor_id', filtros.asesor)
  }
  const busqueda = filtroBusqueda(filtros.q)
  if (busqueda) {
    consulta = consulta.or(busqueda)
  }

  const [
    { data: propiedades, error },
    { data: asesores },
    { data: estatusFilas },
    { data: sync },
  ] = await Promise.all([
    consulta,
    supabase
      .from('usuarios')
      .select('user_id, nombre, activo')
      .in('rol', ROLES_QUE_ASESORAN)
      .order('nombre', { ascending: true }),
    // Valores de estatus realmente presentes, para el filtro.
    supabase.from('propiedades').select('estatus').eq('activa', true),
    supabase.from('sync_estado').select('ultimo_ok').eq('recurso', 'propiedades').maybeSingle(),
  ])

  if (error) {
    throw new Error(`No se pudieron cargar las propiedades: ${error.message}`)
  }

  const filas = (propiedades ?? []) as FilaPropiedad[]
  const nombrePorAsesor = new Map((asesores ?? []).map((a) => [a.user_id, a.nombre]))
  const estatusDisponibles = [...new Set((estatusFilas ?? []).map((f) => f.estatus))].sort()

  const ultimaSync = sync?.ultimo_ok
    ? formatDistanceToNow(new Date(sync.ultimo_ok), { addSuffix: true, locale: es })
    : null

  // Sin filtros activos + cero propiedades = inventario nunca sincronizado
  // (distinto de "esos filtros no encontraron nada").
  const hayFiltros = Boolean(filtros.q || filtros.operacion || filtros.estatus || filtros.asesor)

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Propiedades</h1>
          <p className="text-sm text-slate-500">
            {filas.length} propiedad{filas.length === 1 ? '' : 'es'}
            {ultimaSync ? (
              <span className="text-slate-400"> · Última sincronización: {ultimaSync}</span>
            ) : null}
          </p>
        </div>
        <BotonSincronizar />
      </header>

      <FiltrosPropiedades
        estatusDisponibles={estatusDisponibles}
        asesores={(asesores ?? [])
          .filter((a) => a.activo)
          .map((a) => ({ userId: a.user_id, nombre: a.nombre }))}
      />

      {filas.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 text-center">
          {hayFiltros ? (
            <p className="text-sm text-slate-500">Sin resultados con esos filtros</p>
          ) : (
            <>
              <CloudDownload aria-hidden className="size-6 text-slate-400" />
              <p className="text-sm text-slate-500">
                Aún no hay propiedades. Sincroniza con EasyBroker para traer tu inventario.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((propiedad) => (
            <TarjetaPropiedadAdmin
              key={propiedad.id}
              propiedad={propiedad}
              asesorNombre={
                propiedad.asesor_id ? (nombrePorAsesor.get(propiedad.asesor_id) ?? null) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  )
}
