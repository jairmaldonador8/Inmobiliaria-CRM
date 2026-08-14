import Image from 'next/image'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { captacionesDeAsesor } from '@/lib/captaciones/consultas'
import { evaluarCaptacion } from '@/lib/captaciones/score'
import { ETIQUETA_ESTADO, CLASE_ESTADO } from '@/lib/captaciones/formato'
import { formatearPrecio } from '@/lib/propiedades/formato'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Mis captaciones: la cartera de propiedades que el asesor está subiendo. */
export default async function PaginaCaptacionesAsesor() {
  const usuario = await requireAsesor()
  const supabase = await createClient()
  // Acotar por asesor_id a mano: un admin en vista de asesor pasa RLS.
  const captaciones = await captacionesDeAsesor(supabase, usuario.user_id)

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Captaciones</h1>
          <p className="text-sm text-slate-500">
            Sube tu captación, cuida el score y mándala a revisión.
          </p>
        </div>
        <Button render={<Link href="/asesor/captaciones/nueva" />}>
          <Plus data-icon="inline-start" />
          Nueva
        </Button>
      </header>

      {captaciones.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-700">Aún no tienes captaciones</p>
          <p className="text-sm text-slate-500">
            Cuando consigas una propiedad, súbela aquí: el sistema te va diciendo qué le falta para
            quedar al cien en los portales.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {captaciones.map((c) => {
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
            })
            const portada = c.fotos[0]?.url

            return (
              <li key={c.id}>
                <Link
                  href={`/asesor/captaciones/${c.id}`}
                  className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 transition-shadow hover:shadow-sm"
                >
                  {portada ? (
                    <Image
                      src={portada}
                      alt=""
                      width={112}
                      height={84}
                      className="h-20 w-24 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                      Sin fotos
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {c.titulo || 'Sin título'}
                      </p>
                      <Badge className={cn('shrink-0', CLASE_ESTADO[c.estado])}>
                        {ETIQUETA_ESTADO[c.estado]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {c.precio ? formatearPrecio(c.precio, c.moneda) : 'Sin precio'}
                      {c.colonia ? ` · ${c.colonia}` : ''}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'font-semibold',
                          score.porcentaje >= 80
                            ? 'text-emerald-600'
                            : score.porcentaje >= 50
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        )}
                      >
                        {score.porcentaje}% de calidad
                      </span>
                      <span className="text-slate-400">· {c.fotos.length} fotos</span>
                      {c.estado === 'cargada' && c.easybroker_id ? (
                        <span className="text-slate-400">· {c.easybroker_id}</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
