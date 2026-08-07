import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, MapPin, MessageCircle } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import {
  etiquetaOperacion,
  formatearPrecio,
  formatearSuperficie,
} from '@/lib/propiedades/formato'
import { GaleriaFotos } from '@/components/propiedades/galeria-fotos'
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

export default async function PaginaDetallePropiedadAsesor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireAsesor()
  const { id } = await params
  const supabase = await createClient()

  const { data: propiedad } = await supabase
    .from('propiedades')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!propiedad) notFound()

  const fotos = (propiedad.fotos ?? []) as string[]
  const zona = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')
  const esTuya = propiedad.asesor_id === usuario.user_id

  // Mensaje para compartir por WhatsApp: título + precio + link público.
  // Sin teléfono: el asesor elige el contacto al abrir WhatsApp.
  const textoCompartir = [
    propiedad.titulo,
    formatearPrecio(propiedad.precio, propiedad.moneda),
    propiedad.url_publica,
  ]
    .filter(Boolean)
    .join('\n')
  const enlaceWhatsApp = `https://wa.me/?text=${encodeURIComponent(textoCompartir)}`

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Link
          href="/asesor/propiedades"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a propiedades
        </Link>
      </div>

      {/*
        Dos columnas desde `lg` (mismo patrón que admin/propiedades/[id]):
        galería + WhatsApp + descripción a la izquierda, ficha técnica a la
        derecha. En una sola columna estirada a ~1100px la galería quedaría
        gigantesca y la ficha técnica un cuadro angosto flotando en un mar
        de espacio vacío.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <GaleriaFotos fotos={fotos} titulo={propiedad.titulo} />

          <div className="flex flex-col gap-2">
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
              {esTuya ? (
                <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                  Tuya
                </span>
              ) : null}
            </div>

            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatearPrecio(propiedad.precio, propiedad.moneda)}
            </p>

            <h1 className="text-base font-medium leading-snug text-slate-800">
              {propiedad.titulo}
            </h1>

            {propiedad.ubicacion || zona ? (
              <p className="flex items-start gap-1.5 text-sm text-slate-500">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <span>{propiedad.ubicacion ?? zona}</span>
              </p>
            ) : null}
          </div>

          <a
            href={enlaceWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 active:translate-y-px lg:self-start lg:px-6"
          >
            <MessageCircle aria-hidden className="size-4" />
            Compartir por WhatsApp
          </a>

          {propiedad.descripcion ? (
            <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Descripción</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-600">
                {propiedad.descripcion}
              </p>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Ficha técnica</h2>
          <dl className="divide-y divide-slate-100">
            <Dato etiqueta="Recámaras" valor={propiedad.recamaras != null ? String(propiedad.recamaras) : null} />
            <Dato etiqueta="Baños" valor={propiedad.banos != null ? String(propiedad.banos) : null} />
            <Dato etiqueta="Estacionamientos" valor={propiedad.estacionamientos != null ? String(propiedad.estacionamientos) : null} />
            <Dato etiqueta="Construcción" valor={formatearSuperficie(propiedad.superficie_construccion)} />
            <Dato etiqueta="Terreno" valor={formatearSuperficie(propiedad.superficie_terreno)} />
            <Dato etiqueta="Zona" valor={zona || null} />
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
      </div>
    </section>
  )
}
