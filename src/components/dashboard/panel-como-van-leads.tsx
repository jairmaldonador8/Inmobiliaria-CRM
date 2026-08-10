/**
 * Panel «Cómo van los leads» del dashboard admin: embudo por etapa, mediana
 * de primera respuesta (7 d), leads por fuente (30 d) y actividad de
 * contacto (7 d). Recibe las 4 métricas YA consultadas como props (patrón
 * PanelLeadsEnRiesgo: la página consulta, el panel pinta) y se renderiza en
 * los DOS árboles de src/app/(admin)/admin/page.tsx:
 *
 * - variante 'movil': kit Fintech Muro (TarjetaGlass/StatCard, glass fingido
 *   — cero blur, ver skill fintech-muro-ui). Texto secundario en
 *   text-slate-500 (pasa AA sobre el tinte).
 * - variante 'escritorio': slate/white clásico, como el resto del árbol
 *   `hidden lg:block`.
 *
 * Server Component sin estado: puro render de datos.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import type { ConteoEtapa, ConteoFuente } from '@/lib/dashboard/consultas'
import { etiquetaEtapa, etiquetaFuente } from '@/lib/leads/formato'
import { ZONA_HORARIA } from '@/lib/fechas/monterrey'
import TarjetaGlass from '@/components/fintech/tarjeta-glass'
import StatCard from '@/components/fintech/stat-card'
import { cn } from '@/lib/utils'

export interface MetricasComoVanLeads {
  embudo: ConteoEtapa[]
  /** Mediana de primera respuesta en minutos; null = sin datos aún. */
  medianaMin: number | null
  fuentes: ConteoFuente[]
  /** 7 posiciones, oldest→newest (día calendario de Monterrey). */
  actividad: number[]
}

/** Mismos tokens de gráfica que el pipeline de cápsulas del dashboard. */
const COLORES_BARRAS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'] as const

const UN_DIA_MS = 24 * 60 * 60 * 1000

/** «45 min» / «2 h 15 min» / «3 d 4 h» — legible para el dueño, no ISO. */
function formatearMediana(minutos: number): string {
  const total = Math.round(minutos)
  if (total < 60) return `${total} min`
  const horas = Math.floor(total / 60)
  if (horas < 24) {
    const resto = total % 60
    return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`
  }
  const dias = Math.floor(horas / 24)
  const restoHoras = horas % 24
  return restoHoras > 0 ? `${dias} d ${restoHoras} h` : `${dias} d`
}

/** Iniciales de día («lun», «mar», …) de los últimos 7 días, oldest→newest. */
function etiquetasDias7(): string[] {
  const formato = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: ZONA_HORARIA })
  const ahora = Date.now()
  const etiquetas: string[] = []
  for (let i = 6; i >= 0; i--) {
    etiquetas.push(formato.format(new Date(ahora - i * UN_DIA_MS)).replace('.', ''))
  }
  return etiquetas
}

/** Barras horizontales del embudo, proporcionales al máximo. */
function BarrasEmbudo({ embudo, oscuro }: { embudo: ConteoEtapa[]; oscuro: boolean }) {
  const maximo = Math.max(...embudo.map((e) => e.cuenta), 1)
  return (
    <ul className="flex flex-col gap-1.5">
      {embudo.map((fila, indice) => (
        <li key={fila.etapa} className="flex items-center gap-2">
          <span
            className={cn(
              'w-24 shrink-0 truncate text-xs',
              oscuro ? 'text-slate-600' : 'text-[#5B4C3A]'
            )}
          >
            {etiquetaEtapa(fila.etapa)}
          </span>
          <span
            className={cn(
              'h-2.5 rounded-full',
              COLORES_BARRAS[indice % COLORES_BARRAS.length]
            )}
            style={{ width: `${Math.max((fila.cuenta / maximo) * 100, 6)}%` }}
          />
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              oscuro ? 'text-slate-900' : 'text-[#221B14]'
            )}
          >
            {fila.cuenta}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Mini gráfica de barras verticales de la actividad de contacto (7 días). */
function BarrasActividad({ actividad, oscuro }: { actividad: number[]; oscuro: boolean }) {
  const dias = etiquetasDias7()
  const maximo = Math.max(...actividad, 1)
  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      {actividad.map((cuenta, indice) => (
        <div key={indice} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-14 w-full items-end">
            <div
              className={cn(
                'w-full rounded-t',
                cuenta === 0
                  ? oscuro
                    ? 'bg-slate-200'
                    : 'bg-[#221B14]/10'
                  : oscuro
                    ? 'bg-slate-700'
                    : 'bg-[#C98A3B]'
              )}
              style={{ height: cuenta === 0 ? '3px' : `${Math.max((cuenta / maximo) * 100, 12)}%` }}
            />
          </div>
          <span className={cn('text-[10px]', oscuro ? 'text-slate-400' : 'text-slate-500')}>
            {dias[indice]}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Lista de fuentes con conteo, de mayor a menor. */
function ListaFuentes({ fuentes, oscuro }: { fuentes: ConteoFuente[]; oscuro: boolean }) {
  const maximo = Math.max(...fuentes.map((f) => f.cuenta), 1)
  return (
    <ul className="flex flex-col gap-1.5">
      {fuentes.map((fila) => (
        <li key={fila.fuente} className="flex items-center gap-2">
          <span
            className={cn(
              'w-24 shrink-0 truncate text-xs',
              oscuro ? 'text-slate-600' : 'text-[#5B4C3A]'
            )}
          >
            {etiquetaFuente(fila.fuente)}
          </span>
          <span
            className={cn('h-2.5 rounded-full', oscuro ? 'bg-slate-400' : 'bg-[#A34E28]/60')}
            style={{ width: `${Math.max((fila.cuenta / maximo) * 100, 6)}%` }}
          />
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              oscuro ? 'text-slate-900' : 'text-[#221B14]'
            )}
          >
            {fila.cuenta}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Resumen compacto para el dashboard: en grandes rasgos cómo van los leads
 * (mediana de 1.ª respuesta + actividad de la semana) con enlace a la
 * sección de Leads, donde vive el panel completo.
 */
export function ResumenComoVanLeads({
  medianaMin,
  actividad,
  variante,
}: {
  medianaMin: number | null
  actividad: number[]
  variante: 'movil' | 'escritorio'
}) {
  const totalContactos7d = actividad.reduce((total, valor) => total + valor, 0)
  const resumenMediana =
    medianaMin === null ? 'Sin datos aún' : formatearMediana(medianaMin)

  if (variante === 'movil') {
    return (
      <Link href="/admin/leads" aria-label="Cómo van los leads — ver métricas completas">
        <TarjetaGlass>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Cómo van los leads
            </div>
            <ChevronRight aria-hidden className="size-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xl font-semibold tracking-tight text-[#221B14]">
                {resumenMediana}
              </span>
              <span className="text-[11px] text-slate-500">
                1.ª respuesta · {totalContactos7d} contactos esta semana
              </span>
            </div>
            <div className="w-28 shrink-0">
              <BarrasActividad actividad={actividad} oscuro={false} />
            </div>
          </div>
        </TarjetaGlass>
      </Link>
    )
  }

  return (
    <Link
      href="/admin/leads"
      aria-label="Cómo van los leads — ver métricas completas"
      className="group flex items-center justify-between gap-6 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm text-slate-500">Cómo van los leads</h2>
        <p className="text-2xl font-semibold tracking-tight text-slate-900">{resumenMediana}</p>
        <p className="text-xs text-slate-400">
          1.ª respuesta (mediana 7 d) · {totalContactos7d} contactos esta semana
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="w-40">
          <BarrasActividad actividad={actividad} oscuro />
        </div>
        <span className="text-xs font-medium text-slate-500 group-hover:text-slate-700">
          Ver métricas
          <ChevronRight aria-hidden className="ml-0.5 inline size-3.5" />
        </span>
      </div>
    </Link>
  )
}

export function PanelComoVanLeads({
  metricas,
  variante,
}: {
  metricas: MetricasComoVanLeads
  variante: 'movil' | 'escritorio'
}) {
  const { embudo, medianaMin, fuentes, actividad } = metricas
  const totalContactos7d = actividad.reduce((total, valor) => total + valor, 0)

  if (variante === 'movil') {
    return (
      <section aria-label="Cómo van los leads" className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[#221B14]">Cómo van los leads</h2>

        <div className="grid grid-cols-2 gap-2">
          {medianaMin === null ? (
            <TarjetaGlass>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                1.ª respuesta · 7 d
              </div>
              <p className="mt-1 text-xs text-slate-500">Aún sin datos suficientes</p>
            </TarjetaGlass>
          ) : (
            <StatCard etiqueta="1.ª respuesta · 7 d" valor={formatearMediana(medianaMin)} />
          )}
          <StatCard etiqueta="Contactos · 7 d" valor={String(totalContactos7d)} />
        </div>

        <TarjetaGlass>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Embudo por etapa</div>
          {embudo.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">Todavía no hay leads activos</p>
          ) : (
            <div className="mt-2">
              <BarrasEmbudo embudo={embudo} oscuro={false} />
            </div>
          )}
        </TarjetaGlass>

        <TarjetaGlass>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Actividad de contacto · 7 días
          </div>
          <div className="mt-2">
            <BarrasActividad actividad={actividad} oscuro={false} />
          </div>
        </TarjetaGlass>

        <TarjetaGlass>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            Fuentes · 30 días
          </div>
          {fuentes.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">Sin leads nuevos en los últimos 30 días</p>
          ) : (
            <div className="mt-2">
              <ListaFuentes fuentes={fuentes} oscuro={false} />
            </div>
          )}
        </TarjetaGlass>

        <p className="text-center text-[11px] text-slate-500">
          Las métricas maduran conforme se acumula historia
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Cómo van los leads" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-slate-900">Cómo van los leads</h2>

      <div className="grid grid-cols-1 gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-slate-500">1.ª respuesta (mediana 7 d)</h3>
          {medianaMin === null ? (
            <p className="text-sm text-slate-400">Aún sin datos suficientes</p>
          ) : (
            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatearMediana(medianaMin)}
            </p>
          )}
          <p className="mt-auto text-xs text-slate-400">
            De asignado al primer WhatsApp o seguimiento
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-slate-500">Embudo por etapa</h3>
          {embudo.length === 0 ? (
            <p className="text-sm text-slate-400">Todavía no hay leads activos</p>
          ) : (
            <BarrasEmbudo embudo={embudo} oscuro />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-slate-500">
            Actividad de contacto (7 d) ·{' '}
            <span className="font-semibold text-slate-700">{totalContactos7d}</span>
          </h3>
          <BarrasActividad actividad={actividad} oscuro />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm text-slate-500">Fuentes (30 d)</h3>
          {fuentes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin leads nuevos en los últimos 30 días</p>
          ) : (
            <ListaFuentes fuentes={fuentes} oscuro />
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">Las métricas maduran conforme se acumula historia</p>
    </section>
  )
}
