import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, MapPin } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  etiquetaOperacion,
  formatearPrecio,
  formatearSuperficie,
} from '@/lib/propiedades/formato'
import { GaleriaFotos } from '@/components/propiedades/galeria-fotos'
import { PortalesManuales } from '@/components/propiedades/portales-manuales'
import { SelectorAsesor } from '@/components/propiedades/selector-asesor'
import { ToggleExclusiva } from '@/components/propiedades/toggle-exclusiva'
import { ChipEstatus } from '@/components/propiedades/tarjeta-propiedad'
import { cn } from '@/lib/utils'

/** Fila de la ficha técnica; se omite si no hay valor. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{valor}</dd>
    </div>
  )
}

export default async function PaginaDetallePropiedadAdmin({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = createAdminClient()

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!propiedad) notFound()

  const [{ data: asesores }, { data: portales }, { data: interna }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('user_id, nombre')
      .eq('rol', 'asesor')
      .eq('activo', true)
      .order('nombre', { ascending: true }),
    supabase.from('propiedad_portales').select('portal').eq('propiedad_id', id),
    supabase.from('propiedades_internas').select('exclusiva').eq('propiedad_id', id).maybeSingle(),
  ])

  const fotos = (propiedad.fotos ?? []) as string[]
  const zona = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/propiedades"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a propiedades
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {/* Columna principal: galería + descripción */}
        <div className="flex flex-col gap-6">
          <GaleriaFotos fotos={fotos} titulo={propiedad.titulo} />

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium text-white',
                  propiedad.operacion === 'rental' ? 'bg-blue-600' : 'bg-emerald-600'
                )}
              >
                {etiquetaOperacion(propiedad.operacion)}
              </span>
              <ChipEstatus estatus={propiedad.estatus} />
              {propiedad.tipo ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {propiedad.tipo}
                </span>
              ) : null}
            </div>

            <h1 className="text-xl font-semibold leading-snug tracking-tight text-slate-900">
              {propiedad.titulo}
            </h1>

            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatearPrecio(propiedad.precio, propiedad.moneda)}
            </p>

            {propiedad.ubicacion || zona ? (
              <p className="flex items-start gap-1.5 text-sm text-slate-500">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>{propiedad.ubicacion ?? zona}</span>
              </p>
            ) : null}
          </div>

          {propiedad.descripcion ? (
            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Descripción</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-600">
                {propiedad.descripcion}
              </p>
            </div>
          ) : null}
        </div>

        {/* Columna lateral: ficha, responsable, portales */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Ficha técnica</h2>
            <dl className="divide-y divide-slate-100">
              <Dato etiqueta="Recámaras" valor={propiedad.recamaras != null ? String(propiedad.recamaras) : null} />
              <Dato etiqueta="Baños" valor={propiedad.banos != null ? String(propiedad.banos) : null} />
              <Dato etiqueta="Estacionamientos" valor={propiedad.estacionamientos != null ? String(propiedad.estacionamientos) : null} />
              <Dato etiqueta="Construcción" valor={formatearSuperficie(propiedad.superficie_construccion)} />
              <Dato etiqueta="Terreno" valor={formatearSuperficie(propiedad.superficie_terreno)} />
              <Dato etiqueta="Zona" valor={zona || null} />
              <Dato etiqueta="ID EasyBroker" valor={propiedad.easybroker_id} />
            </dl>
            {propiedad.url_publica ? (
              <a
                href={propiedad.url_publica}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-4 transition-colors hover:text-slate-900 hover:underline"
              >
                Ver en EasyBroker
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : null}
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Asesor responsable</h2>
            <p className="mb-3 text-xs text-slate-500">
              Recibe los leads interesados en esta propiedad.
            </p>
            <SelectorAsesor
              propiedadId={propiedad.id}
              asesorId={propiedad.asesor_id}
              asesores={(asesores ?? []).map((a) => ({ userId: a.user_id, nombre: a.nombre }))}
            />
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Dirección</h2>
            <p className="mb-3 text-xs text-slate-500">
              Marca interna — los asesores no la ven.
            </p>
            <ToggleExclusiva propiedadId={propiedad.id} exclusivaInicial={interna?.exclusiva === true} />
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Publicada en portales</h2>
            <p className="mb-3 text-xs text-slate-500">
              Registro manual de dónde está publicada además de EasyBroker.
            </p>
            <PortalesManuales
              propiedadId={propiedad.id}
              marcados={(portales ?? []).map((p) => p.portal)}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
