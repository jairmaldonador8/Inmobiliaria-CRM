import Link from 'next/link'
import { CloudDownload } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { filtroBusqueda } from '@/lib/propiedades/consultas'
import { cn } from '@/lib/utils'
import { BusquedaPropiedades } from '@/components/propiedades/busqueda-propiedades'
import {
  TarjetaPropiedadAsesor,
  type PropiedadTarjeta,
} from '@/components/propiedades/tarjeta-propiedad'

type FilaPropiedad = PropiedadTarjeta & { asesor_id: string | null }

const CAMPOS_TARJETA =
  'id, titulo, operacion, estatus, precio, moneda, ubicacion, colonia, ciudad, recamaras, banos, estacionamientos, superficie_construccion, superficie_terreno, fotos, asesor_id'

export default async function PaginaPropiedadesAsesor({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mias?: string }>
}) {
  const usuario = await requireAsesor()
  const { q, mias } = await searchParams
  const soloMias = mias === '1'
  const supabase = await createClient()

  let consulta = supabase
    .from('propiedades')
    .select(CAMPOS_TARJETA)
    .eq('activa', true)
    .order('actualizada_eb', { ascending: false, nullsFirst: false })

  // «Mías» (ronda 2, pedido de Arturo): solo las propiedades donde el asesor
  // es el captador/dueño (propiedades.asesor_id). Vive en la URL — a
  // diferencia del filtro por etapa de leads, «mis captaciones» sí es un
  // destino al que se vuelve.
  if (soloMias) {
    consulta = consulta.eq('asesor_id', usuario.user_id)
  }

  const busqueda = filtroBusqueda(q)
  if (busqueda) {
    consulta = consulta.or(busqueda)
  }

  const { data: propiedades, error } = await consulta
  if (error) {
    throw new Error(`No se pudieron cargar las propiedades: ${error.message}`)
  }
  const filas = (propiedades ?? []) as FilaPropiedad[]
  const hayFiltros = Boolean(q) || soloMias

  const sufijoBusqueda = q ? `&q=${encodeURIComponent(q)}` : ''

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Propiedades</h1>
        <p className="text-sm text-slate-500">
          {filas.length} propiedad{filas.length === 1 ? '' : 'es'}
          {soloMias ? ' tuya' + (filas.length === 1 ? '' : 's') : ' en inventario'}
        </p>
      </header>

      <BusquedaPropiedades placeholder="Buscar por título o ubicación" />

      <div className="flex gap-2">
        <Link
          href={`/asesor/propiedades${q ? `?q=${encodeURIComponent(q)}` : ''}`}
          aria-current={!soloMias ? 'page' : undefined}
          className={cn(
            'flex min-h-9 items-center rounded-full px-3 text-xs font-medium transition-colors',
            !soloMias ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          Todas
        </Link>
        <Link
          href={`/asesor/propiedades?mias=1${sufijoBusqueda}`}
          aria-current={soloMias ? 'page' : undefined}
          className={cn(
            'flex min-h-9 items-center rounded-full px-3 text-xs font-medium transition-colors',
            soloMias ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          Mías
        </Link>
      </div>

      {filas.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 text-center">
          {hayFiltros ? (
            <p className="text-sm text-slate-500">
              {soloMias && !q
                ? 'Aún no tienes propiedades a tu nombre en el inventario'
                : 'Sin resultados con esos filtros'}
            </p>
          ) : (
            <>
              <CloudDownload aria-hidden className="size-6 text-slate-400" />
              <p className="text-sm text-slate-500">
                Aún no hay propiedades sincronizadas. Pide a un administrador que sincronice con
                EasyBroker.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-5 xl:grid-cols-3">
          {filas.map((propiedad) => (
            <TarjetaPropiedadAsesor
              key={propiedad.id}
              propiedad={propiedad}
              esTuya={propiedad.asesor_id === usuario.user_id}
            />
          ))}
        </div>
      )}
    </section>
  )
}
