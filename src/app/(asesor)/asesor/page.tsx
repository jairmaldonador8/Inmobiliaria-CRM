import Link from 'next/link'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { AlertTriangle, ChevronRight, Flame, TrendingUp } from 'lucide-react'

import { requireAsesor } from '@/lib/auth/usuario-actual'
import { createClient } from '@/lib/supabase/server'
import { ETAPAS_CERRADAS, NOTA_CIERRE } from '@/lib/leads/formato'

type LeadCola = {
  id: string
  nombre: string
  etapa: string
  creado_en: string
  asignado_en: string | null
}

const MAX_NECESITAN_SEGUIMIENTO = 10
const HORA_MS = 60 * 60 * 1000

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * «Cola del día» del asesor (Task 17): NO es un dashboard, es una lista de
 * trabajo (patrón Smart List) — qué atender primero, no cuánto se ha
 * vendido. Todo con el cliente de SESIÓN: RLS limita automáticamente a los
 * leads y seguimientos propios.
 */
export default async function PaginaInicioAsesor() {
  const usuario = await requireAsesor()
  const supabase = await createClient()

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const [{ data: leadsData, error: errorLeads }, { count: leadsNuevosMes }, { data: cierresMes }] =
    await Promise.all([
      // Leads activos (no cerrados, no archivados): base de ambas listas y
      // del chip «leads activos».
      supabase
        .from('leads')
        .select('id, nombre, etapa, creado_en, asignado_en')
        .eq('archivado', false)
        .not('etapa', 'in', `(${ETAPAS_CERRADAS.join(',')})`)
        .order('creado_en', { ascending: false }),
      // Leads nuevos del mes (por fecha de alta, cualquier etapa).
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('archivado', false)
        .gte('creado_en', inicioMes.toISOString()),
      // Cierres «ganado» del mes: `leads` no tiene columna de fecha de
      // cierre — cambiarEtapa registra un seguimiento de sistema con texto
      // fijo (NOTA_CIERRE) al cerrar, y eso es lo que se cuenta aquí.
      supabase
        .from('seguimientos')
        .select('lead_id')
        .eq('tipo', 'sistema')
        .eq('nota', NOTA_CIERRE.cerrado_ganado)
        .gte('creado_en', inicioMes.toISOString()),
    ])

  if (errorLeads) {
    throw new Error(`No se pudo cargar la cola del día: ${errorLeads.message}`)
  }

  const leads = (leadsData ?? []) as LeadCola[]

  // Último seguimiento por lead: mismo patrón que el kanban (src/app/(asesor)/asesor/leads/page.tsx)
  // — segunda consulta ordenada desc; el primer registro visto por lead es el más reciente.
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

  // «Atiende ahora»: asignados (asignado_en no nulo — un lead auto-capturado
  // por el asesor ya se considera atendido, ver acciones-asesor.ts) que
  // TODAVÍA no tienen ningún seguimiento. Más antiguo asignado primero.
  const atiendeAhora = leads
    .filter((l) => l.asignado_en && !ultimoSeguimiento.has(l.id))
    .sort((a, b) => new Date(a.asignado_en!).getTime() - new Date(b.asignado_en!).getTime())

  // «Necesitan seguimiento»: ya tuvieron contacto, pero el último fue hace
  // más de 24h. Más «abandonado» primero, tope de 10.
  const necesitanSeguimiento = leads
    .filter((l) => {
      const ultimo = ultimoSeguimiento.get(l.id)
      return ultimo ? Date.now() - new Date(ultimo).getTime() > 24 * HORA_MS : false
    })
    .sort(
      (a, b) =>
        new Date(ultimoSeguimiento.get(a.id)!).getTime() -
        new Date(ultimoSeguimiento.get(b.id)!).getTime()
    )
    .slice(0, MAX_NECESITAN_SEGUIMIENTO)

  const leadsActivos = leads.length
  const cerradosGanadosMes = new Set((cierresMes ?? []).map((c) => c.lead_id)).size

  const fechaHoy = capitalizar(format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: es }))

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Hola, {usuario.nombre.split(' ')[0]}
        </h1>
        <p suppressHydrationWarning className="text-sm text-slate-500">
          {fechaHoy}
        </p>
      </header>

      {/* Atiende ahora: nuevos sin atender */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Flame aria-hidden className="size-4 text-red-500" />
          <h2 className="text-sm font-semibold text-slate-900">Atiende ahora</h2>
          {atiendeAhora.length > 0 ? (
            <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {atiendeAhora.length}
            </span>
          ) : null}
        </div>

        {atiendeAhora.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
            Sin leads nuevos pendientes. Todo al día 🎉
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {atiendeAhora.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/asesor/leads/${lead.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs ring-1 ring-red-200 transition-colors active:bg-red-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{lead.nombre}</p>
                    <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-500">
                      Asignado{' '}
                      {formatDistanceToNow(new Date(lead.asignado_en!), {
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
        )}
      </div>

      {/* Necesitan seguimiento */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle aria-hidden className="size-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Necesitan seguimiento</h2>
          {necesitanSeguimiento.length > 0 ? (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {necesitanSeguimiento.length}
            </span>
          ) : null}
        </div>

        {necesitanSeguimiento.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
            Ningún lead lleva más de 24 h sin seguimiento 🎉
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {necesitanSeguimiento.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/asesor/leads/${lead.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200 transition-colors active:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{lead.nombre}</p>
                    <p suppressHydrationWarning className="mt-0.5 text-xs text-slate-500">
                      Último contacto{' '}
                      {formatDistanceToNow(new Date(ultimoSeguimiento.get(lead.id)!), {
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
        )}
      </div>

      {/* Mis números del mes */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden className="size-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">Mis números del mes</h2>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200">
            <p className="text-xl font-semibold tracking-tight text-slate-900">{leadsActivos}</p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">Leads activos</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200">
            <p className="text-xl font-semibold tracking-tight text-slate-900">
              {leadsNuevosMes ?? 0}
            </p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">Nuevos del mes</p>
          </div>
          <div className="rounded-xl bg-white p-3 text-center shadow-xs ring-1 ring-slate-200">
            <p className="text-xl font-semibold tracking-tight text-slate-900">
              {cerradosGanadosMes}
            </p>
            <p className="mt-0.5 text-[0.6875rem] leading-tight text-slate-500">
              Cerrados ganados
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
