import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Phone } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
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
import { ListaVisitasLead } from '@/components/visitas/lista-visitas-lead'
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
  if (!lead) notFound()

  const leadDetalle = lead as unknown as LeadDetalle

  const [
    { data: seguimientos },
    { data: plantillas },
    { data: propiedades },
    visitas,
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
      supabase
        .from('contactos_whatsapp')
        .select('id, resultado')
        .eq('lead_id', id)
        .order('creado_en', { ascending: false })
        .limit(1),
    ])

  // El asesor solo puede leer SU fila de usuarios (RLS): un autor ajeno
  // (p. ej. un admin) llega sin nombre → el timeline muestra «Sistema».
  const itemsTimeline: SeguimientoTimeline[] = (
    (seguimientos ?? []) as unknown as FilaSeguimiento[]
  ).map((s) => ({
    id: s.id,
    tipo: s.tipo,
    nota: s.nota,
    creado_en: s.creado_en,
    autor_nombre: s.autor?.nombre ?? null,
  }))

  // El contacto más reciente manda: si sigue 'pendiente', al volver de
  // WhatsApp la hoja pregunta cómo le fue. Se manda el ID (no un booleano)
  // para que la hoja distinga un pendiente NUEVO de otro que ya se pospuso.
  const filaUltimoContacto = (ultimoContacto ?? [])[0]
  const contactoPendienteId =
    filaUltimoContacto?.resultado === 'pendiente' ? filaUltimoContacto.id : null

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
          <Badge variant="secondary">
            {etiquetaFuenteConDetalle(leadDetalle.fuente, leadDetalle.fuente_detalle)}
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
        {/* Monta el botón «Agendar visita» de la rejilla y, encima, la hoja
            de desenlace al volver de WhatsApp. */}
        <HojaDesenlace
          contactoPendienteId={contactoPendienteId}
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
        <h2 className="text-sm font-semibold text-slate-900">Seguimientos</h2>
        <TimelineSeguimientos seguimientos={itemsTimeline} />
      </div>
    </section>
  )
}
