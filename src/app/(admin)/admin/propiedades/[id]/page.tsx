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
import {
  BarraAccionesMovil,
  BotonVolverFlotante,
  DatosEnCeldas,
  DescripcionPlegable,
  type CeldaDato,
} from '@/components/propiedades/ficha-movil'
import { PortalesManuales } from '@/components/propiedades/portales-manuales'
import { SelectorAsesor } from '@/components/propiedades/selector-asesor'
import { ToggleExclusiva } from '@/components/propiedades/toggle-exclusiva'
import { ChipEstatus } from '@/components/propiedades/tarjeta-propiedad'
import { cn } from '@/lib/utils'

/** Fila de la ficha técnica de escritorio; se omite si no hay valor. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-slate-900">{valor}</dd>
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

  // Mismo mensaje que comparte el asesor: título + precio + link público.
  const textoCompartir = [
    propiedad.titulo,
    formatearPrecio(propiedad.precio, propiedad.moneda),
    propiedad.url_publica,
  ]
    .filter(Boolean)
    .join('\n')
  const enlaceWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoCompartir)}`

  // Los mismos datos de la lista de escritorio, en celdas para el teléfono.
  // Sin «Zona»: es la única de texto largo (se cortaba a «Del Valle, San
  // Pe…») y además ya sale completa sobre la foto, en el velo.
  const celdas: CeldaDato[] = [
    { etiqueta: 'Recámaras', valor: propiedad.recamaras != null ? String(propiedad.recamaras) : null },
    { etiqueta: 'Baños', valor: propiedad.banos != null ? String(propiedad.banos) : null },
    { etiqueta: 'Estac.', valor: propiedad.estacionamientos != null ? String(propiedad.estacionamientos) : null },
    { etiqueta: 'Construcción', valor: formatearSuperficie(propiedad.superficie_construccion) },
    { etiqueta: 'Terreno', valor: formatearSuperficie(propiedad.superficie_terreno) },
    { etiqueta: 'ID EasyBroker', valor: propiedad.easybroker_id },
  ].filter((c): c is CeldaDato => c.valor != null)

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      {/* El enlace de volver de escritorio. En el teléfono lo sustituye el
          botón redondo que flota sobre la foto (ver `accionSuperior`). */}
      <div className="hidden lg:block">
        <Link
          href="/admin/propiedades"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a propiedades
        </Link>
      </div>

      {/*
        `min-w-0` en las dos columnas: un item de rejilla no baja de su
        tamaño mínimo automático, así que CUALQUIER contenido ancho de
        adentro (la tira de miniaturas, un enlace largo en la descripción)
        estira la columna y con ella la página entera en el teléfono. Con
        `min-w-0` el desborde se queda dentro del elemento que lo causa.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:gap-6">
        {/* Columna principal: galería + descripción */}
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <GaleriaFotos
            fotos={fotos}
            titulo={propiedad.titulo}
            accionSuperior={
              <BotonVolverFlotante href="/admin/propiedades" etiqueta="Volver a propiedades" />
            }
            velo={
              <>
                <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-medium tracking-wide uppercase">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-white',
                      propiedad.operacion === 'rental' ? 'bg-blue-600' : 'bg-emerald-600'
                    )}
                  >
                    {etiquetaOperacion(propiedad.operacion)}
                  </span>
                  {propiedad.tipo ? (
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-900">
                      {propiedad.tipo}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums">
                  {formatearPrecio(propiedad.precio, propiedad.moneda)}
                </p>
                {propiedad.ubicacion || zona ? (
                  <p className="mt-0.5 flex items-start gap-1.5 text-sm text-white/85">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 break-words">{propiedad.ubicacion ?? zona}</span>
                  </p>
                ) : null}
              </>
            }
          />

          <div className="flex flex-col gap-2 lg:gap-3">
            {/* Los chips y el precio ya salieron en el velo del teléfono. */}
            <div className="hidden flex-wrap items-center gap-2 lg:flex">
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

            <h1 className="text-base leading-snug font-medium text-slate-800 lg:text-xl lg:font-semibold lg:tracking-tight lg:text-slate-900">
              {propiedad.titulo}
            </h1>

            <p className="hidden text-3xl font-semibold tracking-tight text-slate-900 lg:block">
              {formatearPrecio(propiedad.precio, propiedad.moneda)}
            </p>

            {propiedad.ubicacion || zona ? (
              <p className="hidden items-start gap-1.5 text-sm text-slate-500 lg:flex">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>{propiedad.ubicacion ?? zona}</span>
              </p>
            ) : null}
          </div>

          <DatosEnCeldas datos={celdas} />

          {propiedad.descripcion ? <DescripcionPlegable texto={propiedad.descripcion} /> : null}
        </div>

        {/* Columna lateral: ficha, responsable, portales. En el teléfono la
            ficha técnica ya salió en celdas; el resto son controles de
            dirección y se quedan igual, apilados debajo. */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="hidden min-w-0 rounded-xl bg-white p-5 ring-1 ring-slate-200 lg:block">
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

          <div className="min-w-0 rounded-xl bg-white p-5 ring-1 ring-slate-200">
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

          <div className="min-w-0 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Dirección</h2>
            <p className="mb-3 text-xs text-slate-500">
              Marca interna — los asesores no la ven.
            </p>
            <ToggleExclusiva propiedadId={propiedad.id} exclusivaInicial={interna?.exclusiva === true} />
          </div>

          <div className="min-w-0 rounded-xl bg-white p-5 ring-1 ring-slate-200">
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

      {/* Se coloca sola encima de la píldora de pestañas leyendo `--alto-nav`
          del layout del admin. */}
      <BarraAccionesMovil enlaceWhatsApp={enlaceWhatsApp} urlPublica={propiedad.url_publica} />
    </section>
  )
}
