import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadsGlobal, type LeadGlobal } from '@/lib/leads/consultas'
import { agruparPorEtapa } from '@/lib/dashboard/pipeline'
import {
  ETAPAS_KANBAN,
  claseBadgeEtapa,
  etiquetaEtapa,
  formatearTelefono,
  type EtapaLead,
} from '@/lib/leads/formato'
import { cn } from '@/lib/utils'

/** Mismos colores del pipeline de cápsulas del home admin. */
const COLORES_PIPELINE = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const

/**
 * Apartado del asesor visto por el admin (pedido de Renata, Live test
 * 2026-08-17): su pipeline completo, etapa por etapa, SOLO LECTURA — mover
 * leads por el pipeline sigue siendo chamba del asesor asignado; cada
 * tarjeta lleva al detalle admin del lead, donde ya existen las acciones
 * de dirección (reasignar).
 *
 * Cliente admin (service-role) a propósito: la página ya pasó requireAdmin
 * y necesita los leads DE OTRO usuario (regla de la casa: acotar por
 * asesor_id a mano, RLS no filtra a un admin).
 */
export default async function PaginaPipelineAsesor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const supabase = createAdminClient()
  const { data: asesor } = await supabase
    .from('usuarios')
    .select('user_id, nombre, telefono, activo, rol')
    .eq('user_id', id)
    .eq('rol', 'asesor')
    .maybeSingle()

  if (!asesor) notFound()

  const leads = await leadsGlobal({ asesor: id })
  const activos = leads.filter(
    (lead) => lead.etapa !== 'cerrado_ganado' && lead.etapa !== 'cerrado_perdido'
  )
  const ganados = leads.filter((lead) => lead.etapa === 'cerrado_ganado')
  const perdidos = leads.filter((lead) => lead.etapa === 'cerrado_perdido')
  const segmentos = agruparPorEtapa(activos)

  // Última actividad por lead (seguimientos): es lo que revela un lead
  // muerto — cuánto lleva parado, no cuándo llegó. Mismo patrón del home:
  // consulta ordenada desc, el primer registro visto por lead es el último.
  const ultimaActividad = new Map<string, string>()
  if (leads.length > 0) {
    const { data: seguimientos } = await supabase
      .from('seguimientos')
      .select('lead_id, creado_en')
      .in(
        'lead_id',
        leads.map((lead) => lead.id)
      )
      .order('creado_en', { ascending: false })
    for (const s of seguimientos ?? []) {
      if (!ultimaActividad.has(s.lead_id)) ultimaActividad.set(s.lead_id, s.creado_en)
    }
  }

  const DIA_MS = 24 * 60 * 60 * 1000
  const ahora = Date.now()

  function metaActividad(lead: LeadGlobal): { texto: string; parado: boolean } {
    const referencia = ultimaActividad.get(lead.id)
    if (!referencia) {
      return {
        texto: `sin actividad · llegó ${formatDistanceToNow(new Date(lead.creado_en), { addSuffix: true, locale: es })}`,
        parado: ahora - new Date(lead.creado_en).getTime() > 3 * DIA_MS,
      }
    }
    return {
      texto: `actividad ${formatDistanceToNow(new Date(referencia), { addSuffix: true, locale: es })}`,
      parado: ahora - new Date(referencia).getTime() > 3 * DIA_MS,
    }
  }

  const porEtapa = new Map<EtapaLead, LeadGlobal[]>()
  for (const etapa of ETAPAS_KANBAN) {
    porEtapa.set(
      etapa,
      activos.filter((lead) => lead.etapa === etapa)
    )
  }

  const stats = [
    { etiqueta: 'Activos', valor: activos.length },
    { etiqueta: 'Ganados', valor: ganados.length },
    { etiqueta: 'Perdidos', valor: perdidos.length },
    { etiqueta: 'Total', valor: leads.length },
  ] as const

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <Link
          href="/admin/asesores"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Asesores
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{asesor.nombre}</h1>
          {!asesor.activo ? (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Inactivo
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {asesor.telefono ? `${formatearTelefono(asesor.telefono)} · ` : ''}
          Vista de supervisión, solo lectura — cada lead abre su detalle.
        </p>
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.etiqueta}
            className="rounded-xl bg-white px-3 py-2.5 text-center ring-1 ring-slate-200"
          >
            <p className="text-lg font-semibold text-slate-900">{stat.valor}</p>
            <p className="text-[11px] text-slate-500">{stat.etiqueta}</p>
          </div>
        ))}
      </div>

      {/* Pipeline de cápsulas, mismo lenguaje que el home admin */}
      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Pipeline activo</p>
        {segmentos.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">Sin leads activos en el pipeline</p>
        ) : (
          <>
            <div className="mt-2 flex h-3 gap-1 overflow-hidden rounded-full bg-slate-100">
              {segmentos.map((segmento, indice) => (
                <div
                  key={segmento.etapa}
                  className={cn('rounded-full', COLORES_PIPELINE[indice % COLORES_PIPELINE.length])}
                  style={{ flexGrow: segmento.cantidad }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              {segmentos.map((segmento, indice) => (
                <li key={segmento.etapa} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2 rounded-full',
                      COLORES_PIPELINE[indice % COLORES_PIPELINE.length]
                    )}
                  />
                  {segmento.etiqueta}{' '}
                  <span className="font-semibold text-slate-900">{segmento.cantidad}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Leads por etapa, en el orden canónico del pipeline */}
      {ETAPAS_KANBAN.map((etapa) => {
        const grupo = porEtapa.get(etapa) ?? []
        if (grupo.length === 0) return null
        return (
          <section key={etapa}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                  claseBadgeEtapa(etapa)
                )}
              >
                {etiquetaEtapa(etapa)}
              </span>
              <span className="text-xs text-slate-400">{grupo.length}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {grupo.map((lead) => {
                const actividad = metaActividad(lead)
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/admin/leads/${lead.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white p-3.5 ring-1 ring-slate-200 transition-colors hover:ring-slate-300"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{lead.nombre}</p>
                        <p className="truncate text-sm text-slate-500">
                          {lead.propiedad?.titulo ?? formatearTelefono(lead.telefono)}
                        </p>
                      </div>
                      <span
                        suppressHydrationWarning
                        className={cn(
                          'shrink-0 text-right text-xs',
                          actividad.parado ? 'font-medium text-amber-600' : 'text-slate-400'
                        )}
                      >
                        {actividad.texto}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {activos.length === 0 ? (
        <div className="rounded-xl bg-white py-10 text-center ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">
            {asesor.nombre.split(' ')[0]} no tiene leads activos ahora mismo.
          </p>
        </div>
      ) : null}

      {/* Cerrados: el final de la historia también se supervisa */}
      {([
        ['cerrado_ganado', ganados],
        ['cerrado_perdido', perdidos],
      ] as const).map(([etapa, grupo]) => {
        if (grupo.length === 0) return null
        return (
          <section key={etapa}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                  claseBadgeEtapa(etapa)
                )}
              >
                {etiquetaEtapa(etapa)}
              </span>
              <span className="text-xs text-slate-400">{grupo.length}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {grupo.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/70 p-3.5 ring-1 ring-slate-200 transition-colors hover:ring-slate-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-700">{lead.nombre}</p>
                      <p className="truncate text-sm text-slate-500">
                        {lead.propiedad?.titulo ?? formatearTelefono(lead.telefono)}
                      </p>
                    </div>
                    <span suppressHydrationWarning className="shrink-0 text-xs text-slate-400">
                      {metaActividad(lead).texto}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
