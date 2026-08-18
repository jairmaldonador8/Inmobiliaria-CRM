import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, Building2, ChevronRight, Inbox, RefreshCw, UserRound, Users } from 'lucide-react'

import { requireAdmin } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { leadsEnRiesgo } from '@/lib/guardias/consultas'
import { PanelLeadsEnRiesgo } from '@/components/guardias/panel-leads-en-riesgo'
import { ETAPAS_CERRADAS, claseBadgeEtapa, etiquetaEtapa } from '@/lib/leads/formato'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  actividadContacto7d,
  cierresGanadosMes,
  citasHoy,
  medianaPrimeraRespuesta7d,
  serieLeads30Dias,
} from '@/lib/dashboard/consultas'
import { agruparPorEtapa } from '@/lib/dashboard/pipeline'
import { ROLES_QUE_ASESORAN } from '@/lib/asesores/roles'
import { ResumenComoVanLeads } from '@/components/dashboard/panel-como-van-leads'
import FondoFintech from '@/components/fintech/fondo-fintech'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'
import TarjetaTinta from '@/components/fintech/tarjeta-tinta'
import StatCard from '@/components/fintech/stat-card'
import GraficaLinea from '@/components/fintech/grafica-linea'

const HORA_MS = 60 * 60 * 1000
const MAX_SIN_ATENDER = 15
/** Cap del móvil, más chico que el de escritorio: la pantalla es angosta. */
const MAX_SIN_ATENDER_MOVIL = 5
/** Colores del pipeline de cápsulas, en orden — cicla si hay más etapas activas que colores. */
const COLORES_PIPELINE = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const

type LeadSinAsesor = {
  id: string
  nombre: string
  etapa: string
  asignado_en: string | null
  asesor: { nombre: string } | null
}

/**
 * Dashboard admin F1 (Task 20): 4 KPIs + «Leads sin atender >24h» + estado
 * de la última sincronización EasyBroker. El dashboard completo (métricas
 * de comisiones, gráficas, etc.) llega en F2.
 *
 * Cliente de SESIÓN en todo: el admin ve todo vía RLS (private.is_admin()),
 * igual que /admin/leads/[id].
 *
 * Task FM6: par móvil (estética «Fintech Muro», `lg:hidden`) / escritorio
 * (`hidden lg:block`, JSX intacto de F1). El móvil suma tres consultas
 * nuevas (serieLeads30Dias, cierresGanadosMes, citasHoy) al mismo
 * Promise.all — el pipeline de cápsulas por etapa sale gratis de
 * `leadsAsignados`, que la página ya trae para «sin atender».
 */
export default async function PaginaDashboardAdmin() {
  const usuario = await requireAdmin()
  const supabase = await createClient()

  // Instante "actual" calculado una sola vez, fuera de cualquier .filter/.map
  // del render (mismo patrón que el dashboard del asesor): un `Date.now()`
  // suelto dentro del filtro deja que el encabezado y el corte de «sin
  // atender» lean instantes distintos, y se congelaría en build time si esta
  // página dejara de ser dinámica.
  const ahora = new Date()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [
    { count: leadsBandeja },
    { count: leadsDelMes },
    { count: asesoresActivos },
    { count: propiedadesActivas },
    { data: leadsAsignados, error: errorLeads },
    { data: sync },
    serieLeads,
    cierresGanados,
    citasDeHoy,
    medianaRespuesta,
    actividadContacto,
  ] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('asesor_id', null)
      .eq('archivado', false),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('archivado', false)
      .gte('creado_en', inicioMes.toISOString()),
    supabase
      .from('usuarios')
      .select('user_id', { count: 'exact', head: true })
      .in('rol', ROLES_QUE_ASESORAN)
      .eq('activo', true),
    supabase
      .from('propiedades')
      .select('id', { count: 'exact', head: true })
      .eq('activa', true),
    // Leads asignados y activos: base de «sin atender» — el último
    // seguimiento (o asignado_en si no tiene ninguno) determina la urgencia.
    supabase
      .from('leads')
      .select('id, nombre, etapa, asignado_en, asesor_id, asesor:usuarios!asesor_id(nombre)')
      .not('asesor_id', 'is', null)
      .eq('archivado', false)
      .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`),
    supabase
      .from('sync_estado')
      .select('recurso, ultimo_ok')
      .in('recurso', ['propiedades', 'leads']),
    serieLeads30Dias(supabase),
    cierresGanadosMes(supabase),
    citasHoy(supabase),
    // Resumen «Cómo van los leads»: best-effort — si lead_eventos no
    // responde, el dashboard vive con el resumen vacío (mismo criterio que
    // leadsEnRiesgo más abajo). El panel completo vive en /admin/leads.
    medianaPrimeraRespuesta7d(supabase).catch((): number | null => null),
    actividadContacto7d(supabase).catch((): number[] => new Array(7).fill(0) as number[]),
  ])

  // Leads en riesgo (Fase C): va por service role porque lee
  // lead_escalamientos y los teléfonos de usuarios (RLS los acota); la
  // página ya pasó requireAdmin. Best-effort: si falla, el dashboard vive.
  const adminDb = createAdminClient()
  const [enRiesgo, { data: asesoresParaReasignar }] = await Promise.all([
    leadsEnRiesgo(adminDb, ahora).catch(() => []),
    adminDb
      .from('usuarios')
      .select('user_id, nombre')
      .in('rol', ROLES_QUE_ASESORAN)
      .eq('activo', true)
      .order('nombre'),
  ])
  const opcionesAsesores = (asesoresParaReasignar ?? []).map((a) => ({
    userId: a.user_id,
    nombre: a.nombre,
  }))

  // «Equipo»: carga activa por asesor (gratis de leadsAsignados, ya traído)
  // para abrir el apartado de cada quien (pedido de Renata, Live test
  // 2026-08-17). Los ceros también se muestran: un asesor sin leads es dato.
  const cargaPorAsesor = new Map<string, number>()
  for (const fila of (leadsAsignados ?? []) as unknown as Array<{ asesor_id: string | null }>) {
    if (fila.asesor_id) {
      cargaPorAsesor.set(fila.asesor_id, (cargaPorAsesor.get(fila.asesor_id) ?? 0) + 1)
    }
  }
  const equipo = opcionesAsesores.map((a) => ({
    ...a,
    abiertos: cargaPorAsesor.get(a.userId) ?? 0,
  }))

  if (errorLeads) {
    throw new Error(`No se pudieron cargar los leads sin atender: ${errorLeads.message}`)
  }

  const leads = (leadsAsignados ?? []) as unknown as LeadSinAsesor[]

  // Último seguimiento por lead: mismo patrón que la cola del día del
  // asesor — segunda consulta ordenada desc, primer registro visto por
  // lead es el más reciente.
  const ultimoSeguimiento = new Map<string, string>()
  if (leads.length > 0) {
    const { data: seguimientos } = await supabase
      .from('seguimientos')
      .select('lead_id, creado_en')
      .in(
        'lead_id',
        leads.map((l) => l.id)
      )
      .order('creado_en', { ascending: false })

    for (const s of seguimientos ?? []) {
      if (!ultimoSeguimiento.has(s.lead_id)) {
        ultimoSeguimiento.set(s.lead_id, s.creado_en)
      }
    }
  }

  const sinAtenderTodos = leads
    .map((lead) => ({
      lead,
      referencia: ultimoSeguimiento.get(lead.id) ?? lead.asignado_en,
    }))
    .filter(
      (item): item is { lead: LeadSinAsesor; referencia: string } =>
        item.referencia !== null &&
        ahora.getTime() - new Date(item.referencia).getTime() > 24 * HORA_MS
    )
    .sort((a, b) => new Date(a.referencia).getTime() - new Date(b.referencia).getTime())

  const sinAtender = sinAtenderTodos.slice(0, MAX_SIN_ATENDER)
  const hayMas = sinAtenderTodos.length > MAX_SIN_ATENDER

  const ultimoOkPorRecurso = new Map(
    (sync ?? []).map((s) => [s.recurso, s.ultimo_ok as string | null])
  )
  const ultimaSyncPropiedades = ultimoOkPorRecurso.get('propiedades')
  const ultimaSyncLeads = ultimoOkPorRecurso.get('leads')

  const kpis = [
    {
      etiqueta: 'Leads en bandeja',
      valor: leadsBandeja ?? 0,
      Icono: Inbox,
      href: '/admin/bandeja',
    },
    {
      etiqueta: 'Leads del mes',
      valor: leadsDelMes ?? 0,
      Icono: Users,
      href: null,
    },
    {
      etiqueta: 'Asesores activos',
      valor: asesoresActivos ?? 0,
      Icono: UserRound,
      href: null,
    },
    {
      etiqueta: 'Propiedades activas',
      valor: propiedadesActivas ?? 0,
      Icono: Building2,
      href: '/admin/propiedades',
    },
  ] as const

  // Solo para el móvil: pipeline de cápsulas (gratis de `leads`, ya
  // traído arriba) y un cap más chico de la lista de «sin atender».
  const segmentosPipeline = agruparPorEtapa(leads)
  const sinAtenderMovil = sinAtenderTodos.slice(0, MAX_SIN_ATENDER_MOVIL)
  const hayMasMovil = sinAtenderTodos.length > MAX_SIN_ATENDER_MOVIL
  // La cifra del héroe debe coincidir con lo que grafica GraficaLinea (los
  // últimos 30 días) — `leadsDelMes` es mes calendario y se ve mal los
  // primeros días del mes (cifra chica junto a una gráfica de 30 puntos).
  const leadsUltimos30Dias = serieLeads.reduce((total, valor) => total + valor, 0)

  return (
    <>
      {/* Móvil — estética «Fintech Muro» (Task FM6) */}
      <div className="-mx-4 -mt-6 -mb-28 lg:hidden">
        <FondoFintech className="px-4 pt-6 pb-32">
          <div className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-tight text-[#141414]">
                Hola, {usuario.nombre.split(' ')[0]}
              </h1>
            </header>

            {/* Héroe: leads del mes + tendencia de 30 días */}
            <TarjetaGlass variant="hero">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Leads · 30 días
              </div>
              <p className="text-3xl font-bold text-[#141414]">{leadsUltimos30Dias}</p>
              <GraficaLinea datos={serieLeads} color="#141414" className="mt-2" />
            </TarjetaGlass>

            {/* Leads en riesgo (Fase C) — solo aparece si hay */}
            <PanelLeadsEnRiesgo filas={enRiesgo} asesores={opcionesAsesores} />

            {/* Fila de estadísticas */}
            <div className="grid grid-cols-3 gap-2">
              <TarjetaGlass>
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  Sin atender
                </div>
                <p
                  className={cn(
                    'text-2xl font-bold',
                    sinAtenderTodos.length > 0 ? 'text-[#141414]' : 'text-slate-900'
                  )}
                >
                  {sinAtenderTodos.length}
                </p>
              </TarjetaGlass>
              <StatCard etiqueta="Citas hoy" valor={String(citasDeHoy)} />
              <StatCard etiqueta="Asesores" valor={String(asesoresActivos ?? 0)} />
            </div>

            {/* Cierres del mes */}
            <TarjetaTinta etiqueta="Cierres del mes" cta={{ texto: 'Ver leads', href: '/admin/leads' }}>
              {cierresGanados}
            </TarjetaTinta>

            {/* Pipeline de cápsulas por etapa */}
            <TarjetaGlass>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Pipeline activo
              </div>
              {segmentosPipeline.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">
                  Todavía no hay leads activos en el pipeline
                </p>
              ) : (
                <>
                  <div className="mt-2 flex h-3 gap-1 overflow-hidden rounded-full bg-[#141414]/5">
                    {segmentosPipeline.map((segmento, indice) => (
                      <div
                        key={segmento.etapa}
                        className={cn(
                          'rounded-full',
                          COLORES_PIPELINE[indice % COLORES_PIPELINE.length]
                        )}
                        style={{ flexGrow: segmento.cantidad }}
                      />
                    ))}
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
                    {segmentosPipeline.map((segmento, indice) => (
                      <li
                        key={segmento.etapa}
                        className="flex items-center gap-1.5 text-xs text-[#6E6C66]"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'size-2 rounded-full',
                            COLORES_PIPELINE[indice % COLORES_PIPELINE.length]
                          )}
                        />
                        {segmento.etiqueta}{' '}
                        <span className="font-semibold text-[#141414]">{segmento.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </TarjetaGlass>

            {/* Equipo: el apartado de cada asesor y su pipeline */}
            <TarjetaGlass>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Equipo</div>
              {equipo.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">Sin asesores activos todavía</p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-[#141414]/5">
                  {equipo.map((asesor) => (
                    <li key={asesor.userId}>
                      <Link
                        href={`/admin/asesores/${asesor.userId}`}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="min-w-0 truncate text-sm font-medium text-[#141414]">
                          {asesor.nombre}
                        </span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-[#6E6C66]">
                          <span className="font-semibold text-[#141414]">{asesor.abiertos}</span>
                          {asesor.abiertos === 1 ? 'lead activo' : 'leads activos'}
                          <ChevronRight aria-hidden className="size-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </TarjetaGlass>

            {/* Resumen «Cómo van los leads» → métricas completas en /admin/leads */}
            <ResumenComoVanLeads
              variante="movil"
              medianaMin={medianaRespuesta}
              actividad={actividadContacto}
            />

            {/* Sin atender >24h */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle aria-hidden className="size-4 text-[#141414]" />
                <h2 className="text-sm font-semibold text-[#141414]">Sin atender &gt;24h</h2>
                {sinAtenderTodos.length > 0 ? (
                  <span className="rounded-full bg-[#141414]/8 px-2 py-0.5 text-xs font-semibold text-[#141414]">
                    {sinAtenderTodos.length}
                  </span>
                ) : null}
              </div>

              {sinAtenderMovil.length === 0 ? (
                <TarjetaGlass className="flex flex-col items-center gap-1 py-6 text-center">
                  <p className="text-xl" aria-hidden>
                    🎉
                  </p>
                  <p className="text-xs text-slate-500">Ningún lead lleva más de 24 h sin atención</p>
                </TarjetaGlass>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {sinAtenderMovil.map(({ lead, referencia }) => (
                      <li key={lead.id}>
                        <Link
                          href={`/admin/leads/${lead.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-white/80 bg-[#FAF7F1]/65 p-3 shadow-glass-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#141414]">
                              {lead.nombre}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {lead.asesor?.nombre ?? 'Sin asesor'} ·{' '}
                              <span className="font-semibold text-[#141414]">
                                {formatDistanceToNow(new Date(referencia), {
                                  addSuffix: true,
                                  locale: es,
                                })}
                              </span>
                            </p>
                          </div>
                          <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-500" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {hayMasMovil ? (
                    <p className="text-center text-xs text-slate-500">
                      Mostrando {MAX_SIN_ATENDER_MOVIL} de {sinAtenderTodos.length} leads sin atender
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </FondoFintech>
      </div>

      {/* Escritorio — intacto (F1) */}
      <div className="hidden lg:block">
        <section className="flex flex-col gap-6">
      {/* Leads en riesgo (Fase C) — solo aparece si hay */}
      <PanelLeadsEnRiesgo filas={enRiesgo} asesores={opcionesAsesores} />

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Hola, {usuario.nombre.split(' ')[0]}
        </h1>
        <p className="text-sm text-slate-500">
          {ultimaSyncPropiedades || ultimaSyncLeads ? (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <RefreshCw aria-hidden className="size-3.5" />
              Última sincronización EasyBroker
              {ultimaSyncPropiedades ? (
                <>
                  {' '}
                  · Propiedades{' '}
                  {formatDistanceToNow(new Date(ultimaSyncPropiedades), {
                    addSuffix: true,
                    locale: es,
                  })}
                </>
              ) : null}
              {ultimaSyncLeads ? (
                <>
                  {' '}
                  · Leads{' '}
                  {formatDistanceToNow(new Date(ultimaSyncLeads), {
                    addSuffix: true,
                    locale: es,
                  })}
                </>
              ) : null}
            </span>
          ) : (
            'Aún no hay sincronizaciones con EasyBroker'
          )}
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {kpis.map(({ etiqueta, valor, Icono, href }) => {
          const contenido = (
            <div className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition-shadow sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-500">{etiqueta}</span>
                <Icono aria-hidden className="size-4 shrink-0 text-slate-400" />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900">{valor}</p>
            </div>
          )
          return href ? (
            <Link
              key={etiqueta}
              href={href}
              data-testid={`kpi-${href.split('/').pop()}`}
              className="hover:shadow-sm"
            >
              {contenido}
            </Link>
          ) : (
            <div key={etiqueta}>{contenido}</div>
          )
        })}
      </div>

      {/* Resumen «Cómo van los leads» → métricas completas en /admin/leads */}
      <ResumenComoVanLeads
        variante="escritorio"
        medianaMin={medianaRespuesta}
        actividad={actividadContacto}
      />

      {/* Equipo: el apartado de cada asesor y su pipeline */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <UserRound aria-hidden className="size-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">Equipo</h2>
        </div>
        {equipo.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60">
            <p className="text-sm text-slate-500">Sin asesores activos todavía</p>
          </div>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
            {equipo.map((asesor) => (
              <li key={asesor.userId}>
                <Link
                  href={`/admin/asesores/${asesor.userId}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition-colors hover:ring-slate-300"
                >
                  <span className="min-w-0 truncate font-medium text-slate-900">
                    {asesor.nombre}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-slate-500">
                    <span className="font-semibold text-slate-900">{asesor.abiertos}</span>
                    {asesor.abiertos === 1 ? 'lead activo' : 'leads activos'}
                    <ChevronRight aria-hidden className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Leads sin atender >24h */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden className="size-4 text-amber-500" />
          <h2 className="text-base font-semibold text-slate-900">Leads sin atender &gt;24h</h2>
          {sinAtenderTodos.length > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {sinAtenderTodos.length}
            </span>
          ) : null}
        </div>

        {sinAtender.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-white/60">
            <p className="text-2xl" aria-hidden>
              🎉
            </p>
            <p className="text-sm text-slate-500">Ningún lead lleva más de 24 h sin atención</p>
          </div>
        ) : (
          <>
            <ul className="grid gap-2">
              {sinAtender.map(({ lead, referencia }) => (
                <li key={lead.id}>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200 transition-colors hover:bg-slate-50 sm:p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {lead.nombre}
                        </p>
                        <Badge className={claseBadgeEtapa(lead.etapa)}>
                          {etiquetaEtapa(lead.etapa)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {lead.asesor?.nombre ?? 'Sin asesor'} · Último contacto{' '}
                        {formatDistanceToNow(new Date(referencia), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </p>
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
            {hayMas ? (
              <p className="text-center text-xs text-slate-400">
                Mostrando {MAX_SIN_ATENDER} de {sinAtenderTodos.length} leads sin atender
              </p>
            ) : null}
          </>
        )}
      </div>
        </section>
      </div>
    </>
  )
}
