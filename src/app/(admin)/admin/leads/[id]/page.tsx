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
import { visitasDelLead } from '@/lib/visitas/consultas'
import { Badge } from '@/components/ui/badge'
import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'
import { BotonLlamar } from '@/components/contactos/boton-llamar'
import { HojaDesenlace } from '@/components/contactos/hoja-desenlace'
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
import { type OpcionPropiedadVisita } from '@/components/visitas/hoja-agendar-visita'
import { ListaVisitasLead } from '@/components/visitas/lista-visitas-lead'
import { eventosDeLead, fusionarHistoria } from '@/lib/eventos/consultas'
import { TimelineEventos } from '@/components/eventos/timeline-eventos'
import { ResumenHistorial } from '@/components/eventos/resumen-historial'

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
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ volver?: string }>
}) {
  const admin = await requireAdmin()
  const { id } = await params
  // Contexto de regreso: si se llegó desde el apartado de un asesor, el
  // «atrás» debe devolver ahí y no a la tabla global. Solo se aceptan rutas
  // internas de apartados (nada de redirecciones arbitrarias).
  const { volver } = await searchParams
  const vieneDeAsesor = typeof volver === 'string' && /^\/admin\/asesores\/[\w-]+$/.test(volver)
  const volverHref = vieneDeAsesor ? volver : '/admin/leads'
  const volverTexto = vieneDeAsesor ? 'Volver al asesor' : 'Volver a leads'
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

  const [
    { data: seguimientos },
    { data: plantillas },
    { data: asesores },
    { data: propiedades },
    visitas,
    eventos,
    { data: ultimoContacto },
  ] = await Promise.all([
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
    visitasDelLead(supabase, id),
    // Mismo cliente de sesión: el admin pasa private.is_admin() y ve además
    // los tipos de supervisión — la RLS decide, la UI no filtra.
    eventosDeLead(supabase, id),
    // El admin también atiende leads (2026-08-17): su último contacto, por
    // AUTOR — el pendiente del asesor asignado no es asunto de esta hoja.
    // ⚠️ `.limit(1)`, NUNCA `.maybeSingle()`: el dedupe acepta una carrera
    // que puede dejar dos filas pendientes.
    supabase
      .from('contactos')
      .select('id, resultado, canal')
      .eq('lead_id', id)
      .eq('autor_id', admin.user_id)
      .order('creado_en', { ascending: false })
      .limit(1),
  ])

  const historia = fusionarHistoria(
    eventos,
    (seguimientos ?? []) as unknown as FilaSeguimiento[]
  )

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

  // Misma mecánica que el detalle del asesor: si el último contacto DEL
  // ADMIN sigue pendiente, al volver de WhatsApp/llamada la hoja pregunta
  // cómo le fue.
  const filaUltimoContacto = (ultimoContacto ?? [])[0]
  const contactoPendienteId =
    filaUltimoContacto?.resultado === 'pendiente' ? filaUltimoContacto.id : null
  const canalPendiente =
    filaUltimoContacto?.canal === 'llamada' ? ('llamada' as const) : ('whatsapp' as const)
  const motivoVisitaDeshabilitada =
    leadDetalle.asesor_id === null
      ? 'Asigna el lead a un asesor antes de agendar una visita'
      : null

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link
          href={volverHref}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {volverTexto}
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
          <EtiquetaClasificacionEB clasificacion={leadDetalle.clasificacion_eb} />
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
        {/* Llamar/WhatsApp instrumentados igual que en el detalle del asesor
            (2026-08-17): el dueño también atiende leads, y su toque deja
            pendiente para que la hoja de abajo pregunte cómo le fue. */}
        {leadDetalle.telefono ? (
          <BotonLlamar leadId={leadDetalle.id} telefono={leadDetalle.telefono} />
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
        {/* Monta el botón «Agendar visita» de la rejilla y, encima, la hoja
            de desenlace al volver de WhatsApp o de una llamada. */}
        <HojaDesenlace
          contactoPendienteId={contactoPendienteId}
          canalPendiente={canalPendiente}
          leadId={leadDetalle.id}
          leadNombre={leadDetalle.nombre}
          telefono={leadDetalle.telefono}
          asesorNombre={asesorNombre}
          asesorId={leadDetalle.asesor_id ?? undefined}
          propiedadLeadId={leadDetalle.propiedad_id}
          propiedadLeadTitulo={leadDetalle.propiedad?.titulo ?? null}
          propiedades={opcionesPropiedad as OpcionPropiedadVisita[]}
          deshabilitadoMotivo={motivoVisitaDeshabilitada}
        />
      </div>

      {leadDetalle.asesor_id === null ? (
        <p className="-mt-2 text-xs text-slate-500">
          Asigna el lead a un asesor para poder agendar una visita.
        </p>
      ) : null}

      {leadDetalle.propiedad ? (
        <CardPropiedadInteres
          propiedad={leadDetalle.propiedad}
          href={`/admin/propiedades/${leadDetalle.propiedad.id}`}
        />
      ) : null}

      <DatosLead lead={leadDetalle} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Visitas</h2>
        <ListaVisitasLead
          leadNombre={leadDetalle.nombre}
          telefono={leadDetalle.telefono}
          asesorNombre={asesorNombre}
          asesorId={leadDetalle.asesor_id ?? undefined}
          visitas={visitas}
        />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Historia del lead</h2>
        <ResumenHistorial historia={historia} />
        <TimelineEventos eventos={historia} />
      </div>
    </section>
  )
}
