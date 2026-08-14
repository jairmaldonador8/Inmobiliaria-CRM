import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { captacionPorId } from '@/lib/captaciones/consultas'
import { evaluarCaptacion } from '@/lib/captaciones/score'
import { ETIQUETA_ESTADO, CLASE_ESTADO } from '@/lib/captaciones/formato'
import { formatearPrecio } from '@/lib/propiedades/formato'
import { FormCaptacion } from '@/components/captaciones/form-captacion'
import { AnilloScore } from '@/components/captaciones/anillo-score'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Detalle de una captación del asesor: editable en borrador/regresada,
 * solo lectura cuando ya está en revisión o cargada.
 */
export default async function PaginaCaptacionAsesor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireAsesor()
  const { id } = await params
  const supabase = await createClient()

  const captacion = await captacionPorId(supabase, id)
  // Acotar a mano: un admin en vista de asesor pasa RLS y vería ajenas.
  if (!captacion || captacion.asesor_id !== usuario.user_id) notFound()

  if (captacion.estado === 'borrador' || captacion.estado === 'regresada') {
    return <FormCaptacion captacion={captacion} userId={usuario.user_id} />
  }

  const score = evaluarCaptacion({
    titulo: captacion.titulo,
    descripcion: captacion.descripcion,
    tipo: captacion.tipo,
    operacion: captacion.operacion,
    precio: captacion.precio,
    colonia: captacion.colonia,
    ciudad: captacion.ciudad,
    calle: captacion.calle,
    lat: captacion.lat,
    lng: captacion.lng,
    recamaras: captacion.recamaras,
    banos: captacion.banos,
    medios_banos: captacion.medios_banos,
    estacionamientos: captacion.estacionamientos,
    antiguedad: captacion.antiguedad,
    m2_construccion: captacion.m2_construccion,
    m2_terreno: captacion.m2_terreno,
    video_url: captacion.video_url,
    tour_url: captacion.tour_url,
    fotos: captacion.fotos.length,
    mostrar_ubicacion_exacta: captacion.mostrar_ubicacion_exacta,
  })

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/asesor/captaciones"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Captaciones
        </Link>
        <Badge className={cn(CLASE_ESTADO[captacion.estado])}>
          {ETIQUETA_ESTADO[captacion.estado]}
        </Badge>
      </header>

      <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {captacion.titulo || 'Sin título'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {captacion.precio ? formatearPrecio(captacion.precio, captacion.moneda) : 'Sin precio'}
          {captacion.colonia ? ` · ${captacion.colonia}` : ''}
          {captacion.ciudad ? `, ${captacion.ciudad}` : ''}
        </p>

        {captacion.estado === 'enviada' ? (
          <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-700">
            En revisión del administrador. Te llega la notificación cuando la apruebe o te la
            regrese con comentarios.
          </p>
        ) : null}
        {captacion.estado === 'cargada' ? (
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            Ya vive en EasyBroker como <strong>{captacion.easybroker_id}</strong>. El catálogo del
            sistema la trae en el siguiente ciclo de sincronización.
          </p>
        ) : null}

        <div className="mt-4 flex justify-center">
          <AnilloScore porcentaje={score.porcentaje} publicable={score.publicable} tamano={110} />
        </div>
      </div>

      {captacion.fotos.length > 0 ? (
        <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Fotos ({captacion.fotos.length})
          </h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {captacion.fotos.map((foto, indice) => (
              <li key={foto.path}>
                <Image
                  src={foto.url}
                  alt={`Foto ${indice + 1}`}
                  width={200}
                  height={150}
                  className="h-24 w-full rounded-lg object-cover ring-1 ring-slate-200"
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
