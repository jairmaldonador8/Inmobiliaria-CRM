import Image from 'next/image'
import Link from 'next/link'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { captacionesParaAdmin } from '@/lib/captaciones/consultas'
import { evaluarCaptacion } from '@/lib/captaciones/score'
import { ETIQUETA_ESTADO, CLASE_ESTADO } from '@/lib/captaciones/formato'
import { formatearPrecio } from '@/lib/propiedades/formato'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

function claseScore(porcentaje: number): string {
  return porcentaje >= 80 ? 'text-emerald-600' : porcentaje >= 50 ? 'text-amber-600' : 'text-rose-600'
}

/** Bandeja de captaciones: lo que el equipo está subiendo y su calidad. */
export default async function PaginaCaptacionesAdmin() {
  await requireAdmin()
  const supabase = await createClient()
  const captaciones = await captacionesParaAdmin(supabase)

  const conScore = captaciones.map((c) => ({
    captacion: c,
    porcentaje: evaluarCaptacion({
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
    }).porcentaje,
  }))

  const enRevision = conScore.filter(({ captacion }) => captacion.estado === 'enviada').length

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Captaciones</h1>
          <p className="text-sm text-slate-500">
            {enRevision === 0
              ? 'Nada esperando revisión.'
              : `${enRevision} esperando tu revisión.`}
          </p>
        </div>
      </header>

      {captaciones.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
          <p className="text-sm font-medium text-slate-700">Sin captaciones todavía</p>
          <p className="text-sm text-slate-500">
            Cuando un asesor suba su captación desde la app, aparece aquí con su score de calidad.
          </p>
        </div>
      ) : (
        <>
          {/* Tarjetas (móvil) */}
          <ul className="grid gap-3 lg:hidden">
            {conScore.map(({ captacion: c, porcentaje }) => (
              <li key={c.id}>
                <Link
                  href={`/admin/captaciones/${c.id}`}
                  className="flex gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200"
                >
                  {c.fotos[0]?.url ? (
                    <Image
                      src={c.fotos[0].url}
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
                    <p className="mt-0.5 text-sm text-slate-500">{c.asesor_nombre}</p>
                    <p className={cn('mt-1 text-xs font-semibold', claseScore(porcentaje))}>
                      {porcentaje}% de calidad
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tabla (escritorio) */}
          <div className="hidden overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Captación</TableHead>
                  <TableHead>Asesor</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Calidad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conScore.map(({ captacion: c, porcentaje }) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/admin/captaciones/${c.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.titulo || 'Sin título'}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {[c.colonia, c.ciudad].filter(Boolean).join(', ') || 'Sin ubicación'}
                      </p>
                    </TableCell>
                    <TableCell className="text-slate-600">{c.asesor_nombre}</TableCell>
                    <TableCell className="text-slate-600">
                      {c.precio ? formatearPrecio(c.precio, c.moneda) : '—'}
                    </TableCell>
                    <TableCell>
                      <span className={cn('font-semibold', claseScore(porcentaje))}>
                        {porcentaje}%
                      </span>
                      <span className="ml-1 text-xs text-slate-400">· {c.fotos.length} fotos</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(CLASE_ESTADO[c.estado])}>
                        {ETIQUETA_ESTADO[c.estado]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  )
}
