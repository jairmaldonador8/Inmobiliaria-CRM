import Image from 'next/image'
import Link from 'next/link'
import { Bath, BedDouble, Building2, Car, MapPin, Ruler, UserRound } from 'lucide-react'

import {
  etiquetaEstatus,
  etiquetaOperacion,
  formatearPrecioCompacto,
  formatearSuperficie,
} from '@/lib/propiedades/formato'
import { cn } from '@/lib/utils'

export type PropiedadTarjeta = {
  id: string
  titulo: string
  operacion: string | null
  estatus: string | null
  precio: number | null
  moneda: string
  ubicacion: string | null
  colonia: string | null
  ciudad: string | null
  recamaras: number | null
  banos: number | null
  estacionamientos: number | null
  superficie_construccion: number | null
  superficie_terreno: number | null
  fotos: string[]
}

/** Chip de operación: Venta (esmeralda) / Renta (azul), sobre la foto. */
function ChipOperacion({ operacion }: { operacion: string | null }) {
  if (operacion !== 'sale' && operacion !== 'rental') return null
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium text-white shadow-sm',
        operacion === 'sale' ? 'bg-emerald-600/95' : 'bg-blue-600/95'
      )}
    >
      {etiquetaOperacion(operacion)}
    </span>
  )
}

/** Chip de estatus, tono neutro (verde suave solo si está publicada). */
export function ChipEstatus({ estatus }: { estatus: string | null }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        estatus === 'published'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
          : 'bg-slate-100 text-slate-600 ring-slate-500/20'
      )}
    >
      {etiquetaEstatus(estatus)}
    </span>
  )
}

/** Placeholder neutro cuando la propiedad no tiene fotos. */
export function FotoPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-slate-100', className)}>
      <Building2 aria-hidden className="size-10 text-slate-300" />
    </div>
  )
}

/** Fila de iconitos recámaras / baños / m² (+ estacionamientos en admin). */
function Specs({
  propiedad,
  conEstacionamientos = false,
  className,
}: {
  propiedad: PropiedadTarjeta
  conEstacionamientos?: boolean
  className?: string
}) {
  const superficie = formatearSuperficie(
    propiedad.superficie_construccion ?? propiedad.superficie_terreno
  )
  const items: { icono: React.ReactNode; texto: string; etiqueta: string }[] = []
  if (propiedad.recamaras != null && propiedad.recamaras > 0) {
    items.push({
      icono: <BedDouble aria-hidden className="size-4 text-slate-400" />,
      texto: String(propiedad.recamaras),
      etiqueta: 'recámaras',
    })
  }
  if (propiedad.banos != null && propiedad.banos > 0) {
    items.push({
      icono: <Bath aria-hidden className="size-4 text-slate-400" />,
      texto: String(propiedad.banos),
      etiqueta: 'baños',
    })
  }
  if (conEstacionamientos && propiedad.estacionamientos != null && propiedad.estacionamientos > 0) {
    items.push({
      icono: <Car aria-hidden className="size-4 text-slate-400" />,
      texto: String(propiedad.estacionamientos),
      etiqueta: 'estacionamientos',
    })
  }
  if (superficie) {
    items.push({
      icono: <Ruler aria-hidden className="size-4 text-slate-400" />,
      texto: superficie,
      etiqueta: 'superficie',
    })
  }
  if (items.length === 0) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600', className)}>
      {items.map((item) => (
        <span key={item.etiqueta} className="inline-flex items-center gap-1.5" title={item.etiqueta}>
          {item.icono}
          {item.texto}
        </span>
      ))}
    </div>
  )
}

/**
 * Tarjeta de propiedad para la vista ADMIN: foto de portada, precio compacto,
 * estatus, título, ubicación, specs y asesor responsable.
 */
export function TarjetaPropiedadAdmin({
  propiedad,
  asesorNombre,
}: {
  propiedad: PropiedadTarjeta
  asesorNombre: string | null
}) {
  const portada = propiedad.fotos[0] ?? null

  return (
    <Link
      href={`/admin/propiedades/${propiedad.id}`}
      className="group flex flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 transition-shadow hover:shadow-lg hover:shadow-slate-900/5"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {portada ? (
          <Image
            src={portada}
            alt={propiedad.titulo}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <FotoPlaceholder />
        )}
        <div className="absolute top-3 left-3">
          <ChipOperacion operacion={propiedad.operacion} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight text-slate-900">
            {formatearPrecioCompacto(propiedad.precio, propiedad.moneda)}
          </p>
          <ChipEstatus estatus={propiedad.estatus} />
        </div>

        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-800">
          {propiedad.titulo}
        </h3>

        {propiedad.ubicacion ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin aria-hidden className="size-4 shrink-0 text-slate-400" />
            <span className="line-clamp-1">{propiedad.ubicacion}</span>
          </p>
        ) : null}

        <div className="mt-auto flex flex-col gap-2.5 border-t border-slate-100 pt-3">
          <Specs propiedad={propiedad} />
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <UserRound aria-hidden className="size-3.5 shrink-0 text-slate-400" />
            {asesorNombre ?? 'Sin responsable'}
          </p>
        </div>
      </div>
    </Link>
  )
}

/**
 * Tarjeta de propiedad para la vista ASESOR (móvil): foto grande, precio
 * grande, pensada para enseñarse a un cliente en el teléfono. Badge "Tuya"
 * si la propiedad está asignada al asesor.
 */
export function TarjetaPropiedadAsesor({
  propiedad,
  esTuya,
}: {
  propiedad: PropiedadTarjeta
  esTuya: boolean
}) {
  const portada = propiedad.fotos[0] ?? null

  return (
    <Link
      href={`/asesor/propiedades/${propiedad.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 transition-shadow active:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {portada ? (
          <Image
            src={portada}
            alt={propiedad.titulo}
            fill
            sizes="(max-width: 768px) 100vw, 448px"
            className="object-cover"
          />
        ) : (
          <FotoPlaceholder />
        )}
        <div className="absolute top-3 left-3">
          <ChipOperacion operacion={propiedad.operacion} />
        </div>
        {esTuya ? (
          <span className="absolute top-3 right-3 rounded-full bg-slate-900/90 px-2.5 py-0.5 text-xs font-semibold text-white shadow-sm">
            Tuya
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-2xl font-semibold tracking-tight text-slate-900">
          {formatearPrecioCompacto(propiedad.precio, propiedad.moneda)}
        </p>
        <h3 className="line-clamp-2 text-sm leading-snug text-slate-700">{propiedad.titulo}</h3>
        {propiedad.colonia || propiedad.ciudad ? (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin aria-hidden className="size-4 shrink-0 text-slate-400" />
            <span className="line-clamp-1">
              {[propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')}
            </span>
          </p>
        ) : null}
        <Specs propiedad={propiedad} className="mt-1.5" />
      </div>
    </Link>
  )
}
