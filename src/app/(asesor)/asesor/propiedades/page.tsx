import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { filtroBusqueda } from '@/lib/propiedades/consultas'
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
  searchParams: Promise<{ q?: string }>
}) {
  const usuario = await requireAsesor()
  const { q } = await searchParams
  const supabase = await createClient()

  let consulta = supabase
    .from('propiedades')
    .select(CAMPOS_TARJETA)
    .eq('activa', true)
    .order('actualizada_eb', { ascending: false, nullsFirst: false })

  const busqueda = filtroBusqueda(q)
  if (busqueda) {
    consulta = consulta.or(busqueda)
  }

  const { data: propiedades, error } = await consulta
  if (error) {
    throw new Error(`No se pudieron cargar las propiedades: ${error.message}`)
  }
  const filas = (propiedades ?? []) as FilaPropiedad[]

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Propiedades</h1>
        <p className="text-sm text-slate-500">
          {filas.length} propiedad{filas.length === 1 ? '' : 'es'} en inventario
        </p>
      </header>

      <BusquedaPropiedades placeholder="Buscar por título o ubicación" />

      {filas.length === 0 ? (
        <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
          <p className="text-sm text-slate-500">Sin resultados con esos filtros</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
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
