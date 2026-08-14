import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { captacionPorId } from '@/lib/captaciones/consultas'
import { evaluarCaptacion } from '@/lib/captaciones/score'
import { inicialesDeNombre } from '@/lib/captaciones/payload-eb'
import { ETIQUETA_ESTADO, CLASE_ESTADO } from '@/lib/captaciones/formato'
import { formatearPrecio } from '@/lib/propiedades/formato'
import { AnilloScore } from '@/components/captaciones/anillo-score'
import { ChecklistScore } from '@/components/captaciones/checklist-score'
import { AccionesCaptacionAdmin } from '@/components/captaciones/acciones-captacion-admin'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{etiqueta}</dt>
      <dd className="text-sm text-slate-900">{valor ?? '—'}</dd>
    </div>
  )
}

/** Dashboard de una captación: score, checklist, datos y el botón de carga. */
export default async function PaginaCaptacionAdmin({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const c = await captacionPorId(supabase, id)
  if (!c) notFound()

  const score = evaluarCaptacion({
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
    fotos: c.fotos.length,
    mostrar_ubicacion_exacta: c.mostrar_ubicacion_exacta,
  })

  const iniciales = inicialesDeNombre(c.asesor_nombre)

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/captaciones"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Captaciones
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {c.titulo || 'Sin título'}
        </h1>
        <Badge className={cn(CLASE_ESTADO[c.estado])}>{ETIQUETA_ESTADO[c.estado]}</Badge>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">La captación</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Dato etiqueta="Asesor" valor={`${c.asesor_nombre} (${iniciales})`} />
              <Dato
                etiqueta="Precio"
                valor={c.precio ? formatearPrecio(c.precio, c.moneda) : null}
              />
              <Dato
                etiqueta="Operación"
                valor={c.operacion === 'sale' ? 'Venta' : c.operacion === 'rental' ? 'Renta' : null}
              />
              <Dato etiqueta="Tipo" valor={c.tipo} />
              <Dato
                etiqueta="Ubicación"
                valor={[c.colonia, c.ciudad].filter(Boolean).join(', ') || null}
              />
              <Dato
                etiqueta="Calle"
                valor={c.calle ? `${c.calle} ${c.numero_exterior ?? ''}`.trim() : null}
              />
              <Dato etiqueta="Recámaras" valor={c.recamaras?.toString() ?? null} />
              <Dato
                etiqueta="Baños"
                valor={
                  c.banos !== null
                    ? `${c.banos}${c.medios_banos ? ` + ${c.medios_banos} medios` : ''}`
                    : null
                }
              />
              <Dato etiqueta="Estacionamientos" valor={c.estacionamientos?.toString() ?? null} />
              <Dato
                etiqueta="Antigüedad"
                valor={c.antiguedad !== null ? (c.antiguedad === 0 ? 'Nueva' : `${c.antiguedad} años`) : null}
              />
              <Dato
                etiqueta="M² construcción"
                valor={c.m2_construccion ? `${c.m2_construccion} m²` : null}
              />
              <Dato etiqueta="M² terreno" valor={c.m2_terreno ? `${c.m2_terreno} m²` : null} />
            </dl>

            {(c.video_url || c.tour_url) && (
              <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-sm">
                {c.video_url ? (
                  <a
                    href={c.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-600 underline hover:text-slate-900"
                  >
                    Video <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
                {c.tour_url ? (
                  <a
                    href={c.tour_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-600 underline hover:text-slate-900"
                  >
                    Tour virtual <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Descripción</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {c.descripcion || 'Sin descripción.'}
            </p>
            <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
              Al cargar, la descripción termina con «{iniciales}» — la firma del asesor en
              EasyBroker.
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Fotos ({c.fotos.length})
            </h2>
            {c.fotos.length === 0 ? (
              <p className="text-sm text-slate-500">Sin fotos.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {c.fotos.map((foto, indice) => (
                  <li key={foto.path} className="relative">
                    <a href={foto.url} target="_blank" rel="noopener noreferrer">
                      <Image
                        src={foto.url}
                        alt={`Foto ${indice + 1}`}
                        width={220}
                        height={160}
                        className="h-28 w-full rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    </a>
                    {indice === 0 ? (
                      <span className="absolute left-1 top-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
                        Portada
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="top-4 flex flex-col gap-4 lg:sticky">
          <div className="flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <AnilloScore porcentaje={score.porcentaje} publicable={score.publicable} />

            {c.estado === 'enviada' ? (
              <AccionesCaptacionAdmin
                captacionId={c.id}
                titulo={c.titulo}
                publicable={score.publicable}
                asesorNombre={c.asesor_nombre}
              />
            ) : null}

            {c.estado === 'cargada' ? (
              <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                En EasyBroker como <strong>{c.easybroker_id}</strong>
                {c.cargada_en
                  ? ` desde el ${new Date(c.cargada_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}`
                  : ''}
                . El sync la traerá al catálogo del sistema.
              </p>
            ) : null}

            {c.estado === 'regresada' && c.comentario_admin ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                Regresada con comentarios: {c.comentario_admin}
              </p>
            ) : null}

            {c.estado === 'borrador' ? (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                El asesor sigue armándola; podrás actuar cuando la envíe a revisión.
              </p>
            ) : null}
          </div>

          <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
            <ChecklistScore score={score} />
          </div>
        </aside>
      </div>
    </section>
  )
}
