import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Phone } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadEnEscalamientoAbierto } from '@/lib/guardias/consultas'
import { BotonTomarLead } from '@/components/guardias/boton-tomar-lead'
import { etiquetaFuenteConDetalle } from '@/lib/leads/formato'
import { visitasDelLead } from '@/lib/visitas/consultas'
import { Badge } from '@/components/ui/badge'
import { SelectorEtapa } from '@/components/leads/selector-etapa'
import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'
import { BotonWhatsApp, type PlantillaWhatsApp } from '@/components/leads/boton-whatsapp'
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
import { HojaDesenlace } from '@/components/contactos/hoja-desenlace'
import { BotonLlamar } from '@/components/contactos/boton-llamar'
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
 * Detalle de lead del asesor (móvil primero). Cliente de SESIÓN en TODO:
 * RLS solo devuelve leads propios — un lead ajeno (o inexistente) no trae
 * fila y cae en notFound().
 *
 * El `.eq('asesor_id', ...)` explícito cubre el caso del admin en la vista de
 * asesor: él sí pasa RLS para cualquier lead, y esta pantalla debe comportarse
 * como la ve un asesor. Para ver un lead ajeno está la vista de admin.
 */
export default async function PaginaDetalleLeadAsesor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const usuario = await requireAsesor()
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select(
      '*, propiedad:propiedades(id, titulo, precio, moneda, colonia, ciudad, fotos)'
    )
    .eq('id', id)
    .eq('asesor_id', usuario.user_id)
    .eq('archivado', false)
    .maybeSingle()

  if (!lead) {
    // Lead ajeno: solo es visible si está en escalamiento ABIERTO (30 min sin
    // respuesta) — la push «tómalo» trae aquí a todos los asesores. La
    // consulta va por service role a propósito: el asesor no tiene RLS sobre
    // leads ajenos ni sobre lead_escalamientos, y esta pantalla solo expone
    // el nombre del lead + el botón (el detalle completo se gana tomándolo).
    const abierto = await leadEnEscalamientoAbierto(createAdminClient(), id)
    if (!abierto || abierto.asesor_id === usuario.user_id) notFound()

    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <Link
            href="/asesor"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Volver al inicio
          </Link>
        </div>

        <div className="rounded-xl bg-white p-5 text-center ring-1 ring-slate-200">
          <p className="text-xs font-semibold tracking-wide text-red-600 uppercase">
            Lead disponible
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
            {abierto.nombre}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Lleva más de 30 minutos sin respuesta. El primero que lo tome se lo queda y le da
            seguimiento.
          </p>
          <div className="mt-4">
            <BotonTomarLead leadId={id} />
          </div>
        </div>
      </section>
    )
  }

  const leadDetalle = lead as unknown as LeadDetalle

  const [
    { data: seguimientos },
    { data: plantillas },
    { data: propiedades },
    visitas,
    { data: ultimoContacto },
    eventos,
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
      // El combobox de propiedad solo aplica si el lead no tiene una.
      leadDetalle.propiedad_id
        ? Promise.resolve({ data: [] as { id: string; titulo: string }[] })
        : supabase
            .from('propiedades')
            .select('id, titulo')
            .eq('activa', true)
            .order('titulo', { ascending: true }),
      visitasDelLead(supabase, id),
      // ⚠️ `.limit(1)`, NUNCA `.maybeSingle()`: el dedupe de
      // `registrarSalidaWhatsapp` acepta una carrera que puede dejar dos
      // filas pendientes, y `maybeSingle()` reventaría con PGRST116.
      // Por AUTOR: desde que el admin también contacta leads (2026-08-17),
      // cada quien reporta SUS toques — un pendiente del admin en este lead
      // no debe abrirle la hoja al asesor.
      supabase
        .from('contactos')
        .select('id, resultado, canal')
        .eq('lead_id', id)
        .eq('autor_id', usuario.user_id)
        .order('creado_en', { ascending: false })
        .limit(1),
      // Mismo cliente de sesión: la RLS ya oculta al asesor los tipos de
      // supervisión (escalamiento_paso, push_recordatorio).
      eventosDeLead(supabase, id),
    ])

  // El asesor solo puede leer SU fila de usuarios (RLS): un autor ajeno
  // (p. ej. un admin) llega sin nombre → el timeline muestra «Sistema».
  const historia = fusionarHistoria(
    eventos,
    (seguimientos ?? []) as unknown as FilaSeguimiento[]
  )

  // El contacto más reciente manda: si sigue 'pendiente', al volver de
  // WhatsApp la hoja pregunta cómo le fue. Se manda el ID (no un booleano)
  // para que la hoja distinga un pendiente NUEVO de otro que ya se pospuso.
  const filaUltimoContacto = (ultimoContacto ?? [])[0]
  const contactoPendienteId =
    filaUltimoContacto?.resultado === 'pendiente' ? filaUltimoContacto.id : null
  // De qué canal preguntar al volver: la hoja cambia el texto y el icono.
  const canalPendiente =
    filaUltimoContacto?.canal === 'llamada' ? ('llamada' as const) : ('whatsapp' as const)

  const contexto = contextoPlantillasLead(leadDetalle, usuario.nombre)
  const opcionesPropiedad = (propiedades ?? []) as OpcionPropiedadSeguimiento[]
  const antiguedad = formatDistanceToNow(new Date(leadDetalle.creado_en), {
    addSuffix: true,
    locale: es,
  })

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/asesor/leads"
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
          <SelectorEtapa leadId={leadDetalle.id} etapa={leadDetalle.etapa} />
          <Badge variant="secondary" className="min-w-0 shrink">
            <span className="block max-w-48 truncate">
              {etiquetaFuenteConDetalle(leadDetalle.fuente, leadDetalle.fuente_detalle)}
            </span>
          </Badge>
          <EtiquetaClasificacionEB clasificacion={leadDetalle.clasificacion_eb} />
          <span suppressHydrationWarning className="text-xs text-slate-400">
            {antiguedad}
          </span>
        </div>
      </header>

      {/* Barra de acciones: 2×2 para objetivos táctiles grandes en móvil. */}
      <div className="grid grid-cols-2 gap-2">
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
            de desenlace al volver de WhatsApp. */}
        <HojaDesenlace
          contactoPendienteId={contactoPendienteId}
          canalPendiente={canalPendiente}
          leadId={leadDetalle.id}
          leadNombre={leadDetalle.nombre}
          telefono={leadDetalle.telefono}
          asesorNombre={usuario.nombre}
          asesorId={usuario.user_id}
          propiedadLeadId={leadDetalle.propiedad_id}
          propiedadLeadTitulo={leadDetalle.propiedad?.titulo ?? null}
          propiedades={opcionesPropiedad as OpcionPropiedadVisita[]}
        />
      </div>

      {leadDetalle.propiedad ? (
        <CardPropiedadInteres
          propiedad={leadDetalle.propiedad}
          href={`/asesor/propiedades/${leadDetalle.propiedad.id}`}
        />
      ) : null}

      <DatosLead lead={leadDetalle} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Visitas</h2>
        <ListaVisitasLead
          leadNombre={leadDetalle.nombre}
          telefono={leadDetalle.telefono}
          asesorNombre={usuario.nombre}
          asesorId={usuario.user_id}
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
