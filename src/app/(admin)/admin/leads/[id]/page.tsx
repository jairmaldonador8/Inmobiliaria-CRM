import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Phone } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import {
  claseBadgeEtapa,
  etiquetaEtapa,
  etiquetaFuenteConDetalle,
} from '@/lib/leads/formato'
import { Badge } from '@/components/ui/badge'
import { BotonWhatsApp, type PlantillaWhatsApp } from '@/components/leads/boton-whatsapp'
import { ReasignarLead } from '@/components/leads/reasignar-lead'
import {
  CardPropiedadInteres,
  DatosLead,
  contextoPlantillasLead,
  type LeadDetalle,
} from '@/components/leads/detalle-lead'
import {
  SheetSeguimiento,
  type OpcionPropiedadSeguimiento,
} from '@/components/seguimientos/sheet-seguimiento'
import {
  HojaAgendarVisita,
  type OpcionPropiedadVisita,
} from '@/components/visitas/hoja-agendar-visita'
import {
  TimelineSeguimientos,
  type SeguimientoTimeline,
} from '@/components/seguimientos/timeline-seguimientos'

type FilaSeguimiento = {
  id: string
  tipo: string
  nota: string
  creado_en: string
  autor: { nombre: string } | null
}

/**
 * Detalle de lead del admin: mismo layout que el del asesor + asesor
 * asignado con select de (re)asignación — también sirve para leads de la
 * bandeja (sin asesor → «Asignar»).
 *
 * Cliente de SESIÓN: la policy de admin ve todos los leads; un id
 * inexistente no trae fila y cae en notFound(). La etapa aquí es solo
 * lectura — moverla por el pipeline es chamba del asesor asignado.
 */
export default async function PaginaDetalleLeadAdmin({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const admin = await requireAdmin()
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select(
      '*, propiedad:propiedades(id, titulo, precio, moneda, colonia, ciudad, fotos), asesor:usuarios(user_id, nombre)'
    )
    .eq('id', id)
    .eq('archivado', false)
    .maybeSingle()
  if (!lead) notFound()

  const leadDetalle = lead as unknown as LeadDetalle & {
    asesor: { user_id: string; nombre: string } | null
  }

  const [{ data: seguimientos }, { data: plantillas }, { data: asesores }, { data: propiedades }] =
    await Promise.all([
      supabase
        .from('seguimientos')
        .select('id, tipo, nota, creado_en, autor:usuarios(nombre)')
        .eq('lead_id', id)
        .order('creado_en', { ascending: false }),
      supabase
        .from('plantillas_mensajes')
        .select('id, nombre, texto')
        .eq('activa', true)
        .order('creada_en', { ascending: true }),
      supabase
        .from('usuarios')
        .select('user_id, nombre')
        .eq('rol', 'asesor')
        .eq('activo', true)
        .order('nombre', { ascending: true }),
      leadDetalle.propiedad_id
        ? Promise.resolve({ data: [] as { id: string; titulo: string }[] })
        : supabase
            .from('propiedades')
            .select('id, titulo')
            .eq('activa', true)
            .order('titulo', { ascending: true }),
    ])

  const itemsTimeline: SeguimientoTimeline[] = (
    (seguimientos ?? []) as unknown as FilaSeguimiento[]
  ).map((s) => ({
    id: s.id,
    tipo: s.tipo,
    nota: s.nota,
    creado_en: s.creado_en,
    autor_nombre: s.autor?.nombre ?? null,
  }))

  // {asesor} en las plantillas = el asesor asignado; sin asesor, el admin.
  // Mismo nombre para la confirmación de WhatsApp de la visita agendada.
  const asesorNombre = leadDetalle.asesor?.nombre ?? admin.nombre
  const contexto = contextoPlantillasLead(leadDetalle, asesorNombre)
  const opcionesAsesor = (asesores ?? []).map((a) => ({
    userId: a.user_id,
    nombre: a.nombre,
  }))
  const opcionesPropiedad = (propiedades ?? []) as OpcionPropiedadSeguimiento[]
  const antiguedad = formatDistanceToNow(new Date(leadDetalle.creado_en), {
    addSuffix: true,
    locale: es,
  })

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Volver a leads
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {leadDetalle.nombre}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={claseBadgeEtapa(leadDetalle.etapa)}>
            {etiquetaEtapa(leadDetalle.etapa)}
          </Badge>
          <Badge variant="secondary">
            {etiquetaFuenteConDetalle(leadDetalle.fuente, leadDetalle.fuente_detalle)}
          </Badge>
          <span suppressHydrationWarning className="text-xs text-slate-400">
            {antiguedad}
          </span>
        </div>
      </header>

      {/* Asesor asignado + (re)asignación — el diferencial del detalle admin. */}
      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Asesor asignado</h2>
          <span data-asesor-asignado className="text-sm text-slate-600">
            {leadDetalle.asesor?.nombre ?? <Badge variant="outline">Bandeja</Badge>}
          </span>
        </div>
        <ReasignarLead
          leadId={leadDetalle.id}
          leadNombre={leadDetalle.nombre}
          asesorActualId={leadDetalle.asesor?.user_id ?? null}
          asesores={opcionesAsesor}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {leadDetalle.telefono ? (
          <a
            href={`tel:+${leadDetalle.telefono}`}
            className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-input bg-white text-xs font-medium text-slate-900 shadow-xs transition-colors hover:bg-slate-50 active:translate-y-px"
          >
            <Phone aria-hidden className="size-5" />
            Llamar
          </a>
        ) : (
          <span className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-input bg-slate-50 text-xs font-medium text-slate-400">
            <Phone aria-hidden className="size-5" />
            Llamar
          </span>
        )}
        <BotonWhatsApp
          leadId={leadDetalle.id}
          telefono={leadDetalle.telefono}
          plantillas={(plantillas ?? []) as PlantillaWhatsApp[]}
          contexto={contexto}
        />
        <SheetSeguimiento
          leadId={leadDetalle.id}
          propiedadLeadId={leadDetalle.propiedad_id}
          propiedades={opcionesPropiedad}
        />
        <HojaAgendarVisita
          leadId={leadDetalle.id}
          leadNombre={leadDetalle.nombre}
          telefono={leadDetalle.telefono}
          asesorNombre={asesorNombre}
          propiedadLeadId={leadDetalle.propiedad_id}
          propiedadLeadTitulo={leadDetalle.propiedad?.titulo ?? null}
          propiedades={opcionesPropiedad as OpcionPropiedadVisita[]}
        />
      </div>

      {leadDetalle.propiedad ? (
        <CardPropiedadInteres
          propiedad={leadDetalle.propiedad}
          href={`/admin/propiedades/${leadDetalle.propiedad.id}`}
        />
      ) : null}

      <DatosLead lead={leadDetalle} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Seguimientos</h2>
        <TimelineSeguimientos seguimientos={itemsTimeline} />
      </div>
    </section>
  )
}
