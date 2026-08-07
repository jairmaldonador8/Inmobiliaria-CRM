import Image from 'next/image'
import Link from 'next/link'
import { Building2, ChevronRight, Quote } from 'lucide-react'

import { formatearTelefono } from '@/lib/leads/formato'
import { formatearPrecio } from '@/lib/propiedades/formato'
import type { ContextoPlantilla } from '@/lib/plantillas/rellenar'
import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'

/**
 * Piezas de presentación COMPARTIDAS entre el detalle de lead del asesor
 * (/asesor/leads/[id]) y el del admin (/admin/leads/[id]). Server
 * Components sin estado.
 */

export type PropiedadInteres = {
  id: string
  titulo: string
  precio: number | null
  moneda: string
  colonia: string | null
  ciudad: string | null
  fotos: string[] | null
}

export type LeadDetalle = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  fuente: string
  fuente_detalle: string | null
  etapa: string
  presupuesto: number | null
  zona_interes: string | null
  notas: string | null
  mensaje_original: string | null
  creado_en: string
  propiedad_id: string | null
  asesor_id: string | null
  clasificacion_eb: ClasificacionLeadEB | null
  propiedad: PropiedadInteres | null
}

/**
 * Contexto de variables para las plantillas de WhatsApp del lead:
 * la zona sale de la propiedad de interés (colonia, ciudad) o, en su
 * defecto, de la zona de interés del lead; el precio va YA formateado.
 */
export function contextoPlantillasLead(
  lead: LeadDetalle,
  asesorNombre: string
): ContextoPlantilla {
  const propiedad = lead.propiedad
  const zonaPropiedad = propiedad
    ? [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')
    : ''
  return {
    nombre: lead.nombre,
    propiedad: propiedad?.titulo ?? null,
    zona: zonaPropiedad || lead.zona_interes || null,
    precio:
      propiedad && propiedad.precio != null
        ? formatearPrecio(propiedad.precio, propiedad.moneda)
        : null,
    asesor: asesorNombre,
  }
}

/** Fila de la ficha de datos; se omite si no hay valor. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-slate-500">{etiqueta}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-slate-900">
        {valor}
      </dd>
    </div>
  )
}

/**
 * Ficha de datos del lead. Solo lectura a propósito (Fase 1): la edición
 * de datos del lead queda en el backlog.
 */
export function DatosLead({ lead }: { lead: LeadDetalle }) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Datos</h2>
      <dl className="divide-y divide-slate-100">
        <Dato etiqueta="Teléfono" valor={lead.telefono ? formatearTelefono(lead.telefono) : null} />
        <Dato etiqueta="Correo" valor={lead.email} />
        <Dato
          etiqueta="Presupuesto"
          valor={lead.presupuesto != null ? formatearPrecio(lead.presupuesto, 'MXN') : null}
        />
        <Dato etiqueta="Zona de interés" valor={lead.zona_interes} />
      </dl>

      {lead.notas ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <h3 className="text-xs font-medium text-slate-500">Notas</h3>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-600">
            {lead.notas}
          </p>
        </div>
      ) : null}

      {lead.mensaje_original ? (
        <blockquote className="mt-3 rounded-lg border-l-2 border-slate-300 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Quote aria-hidden className="size-3" />
            Mensaje original (EasyBroker)
          </p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-600">
            {lead.mensaje_original}
          </p>
        </blockquote>
      ) : null}
    </div>
  )
}

/**
 * Tarjeta de la propiedad de interés: foto chica + título + precio,
 * enlazada al detalle de propiedad del rol correspondiente.
 */
export function CardPropiedadInteres({
  propiedad,
  href,
}: {
  propiedad: PropiedadInteres
  href: string
}) {
  const foto = propiedad.fotos?.[0] ?? null
  const zona = [propiedad.colonia, propiedad.ciudad].filter(Boolean).join(', ')

  return (
    <Link
      href={href}
      data-propiedad-interes
      className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200 transition-shadow hover:shadow-sm"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
        {foto ? (
          <Image src={foto} alt={propiedad.titulo} fill sizes="64px" className="object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-slate-400">
            <Building2 aria-hidden className="size-6" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500">Propiedad de interés</p>
        <p className="truncate text-sm font-medium text-slate-900">{propiedad.titulo}</p>
        <p className="text-sm text-slate-600">
          {formatearPrecio(propiedad.precio, propiedad.moneda)}
          {zona ? <span className="text-slate-400"> · {zona}</span> : null}
        </p>
      </div>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
    </Link>
  )
}
