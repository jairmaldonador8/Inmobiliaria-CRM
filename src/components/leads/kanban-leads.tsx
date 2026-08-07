'use client'

import Link from 'next/link'
import { useMemo, useOptimistic, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import { Building2, EllipsisVertical } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'

import { cambiarEtapa } from '@/lib/leads/acciones-asesor'
import {
  ETAPAS_KANBAN,
  ETAPAS_SELECCIONABLES,
  claseBadgeEtapa,
  etiquetaEtapa,
  etiquetaFuenteConDetalle,
  type EtapaLead,
} from '@/lib/leads/formato'
import { cn } from '@/lib/utils'
import type { ClasificacionLeadEB } from '@/lib/easybroker/mapeo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EtiquetaClasificacionEB } from '@/components/leads/etiqueta-clasificacion-eb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type LeadKanban = {
  id: string
  nombre: string
  fuente: string
  fuente_detalle: string | null
  etapa: string
  creado_en: string
  clasificacion_eb: ClasificacionLeadEB | null
  propiedad_titulo: string | null
  /** creado_en del último seguimiento del lead, o null si no tiene. */
  ultimo_seguimiento: string | null
}

const HORA_MS = 60 * 60 * 1000

/**
 * Punto de alerta por falta de seguimiento: ámbar > 24 h, rojo > 48 h desde
 * el último seguimiento (o desde la creación si nunca ha tenido). Los leads
 * cerrados ya no requieren seguimiento — sin punto.
 */
function puntoSeguimiento(lead: LeadKanban): string | null {
  if (lead.etapa === 'cerrado_ganado' || lead.etapa === 'cerrado_perdido') return null
  const referencia = lead.ultimo_seguimiento ?? lead.creado_en
  const horas = (Date.now() - new Date(referencia).getTime()) / HORA_MS
  if (horas > 48) return 'bg-red-500'
  if (horas > 24) return 'bg-amber-500'
  return null
}

type MoverLead = (lead: LeadKanban, etapa: EtapaLead) => void

function TarjetaLead({ lead, onMover }: { lead: LeadKanban; onMover: MoverLead }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: lead.id,
  })

  const punto = puntoSeguimiento(lead)
  const antiguedad = formatDistanceToNow(new Date(lead.creado_en), {
    addSuffix: true,
    locale: es,
  })

  return (
    <li
      ref={setNodeRef}
      data-lead={lead.id}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      className={cn(
        'relative touch-manipulation rounded-lg bg-white p-3 shadow-xs ring-1 ring-slate-200',
        isDragging && 'z-50 cursor-grabbing opacity-90 shadow-lg ring-slate-400'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {punto ? (
              <span
                aria-label="Sin seguimiento reciente"
                className={cn('size-2 shrink-0 rounded-full', punto)}
              />
            ) : null}
            <p className="truncate text-sm font-medium text-slate-900">{lead.nombre}</p>
          </div>
          {lead.propiedad_titulo ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <Building2 aria-hidden className="size-3 shrink-0" />
              <span className="line-clamp-1">{lead.propiedad_titulo}</span>
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="px-1.5 text-[0.6875rem]">
              {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}
            </Badge>
            <EtiquetaClasificacionEB
              clasificacion={lead.clasificacion_eb}
              className="px-1.5 text-[0.6875rem]"
            />
            {/* suppressHydrationWarning: «hace X» se calcula en servidor y
                cliente con milisegundos de diferencia. */}
            <span suppressHydrationWarning className="text-[0.6875rem] text-slate-400">
              {antiguedad}
            </span>
          </div>
        </div>

        {/* Menú «Mover a…»: la ruta CONFIABLE en táctil (el drag con
            tap-and-hold es frágil en móvil; el menú siempre funciona). */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Acciones para ${lead.nombre}`}
                className="-mt-1 -mr-1 shrink-0 text-slate-500"
              />
            }
          >
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem render={<Link href={`/asesor/leads/${lead.id}`} />}>
              Ver detalle
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Mover a…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {/* Incluye cerrado_ganado/cerrado_perdido a proposito: con
                    esas etapas fuera del tablero, este menu es una de las
                    dos rutas para cerrar un lead (la otra es el selector de
                    etapa de la ficha). */}
                {ETAPAS_SELECCIONABLES.filter((etapa) => etapa !== lead.etapa).map((etapa) => (
                  <DropdownMenuItem key={etapa} onClick={() => onMover(lead, etapa)}>
                    {etiquetaEtapa(etapa)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

function ColumnaEtapa({
  etapa,
  leads,
  onMover,
}: {
  etapa: EtapaLead
  leads: LeadKanban[]
  onMover: MoverLead
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa })

  return (
    <section
      ref={setNodeRef}
      data-etapa={etapa}
      aria-label={`Columna ${etiquetaEtapa(etapa)}`}
      className={cn(
        'flex w-[280px] min-w-[280px] shrink-0 snap-start flex-col gap-2 rounded-xl bg-slate-100 p-2 transition-shadow',
        isOver && 'ring-2 ring-slate-400'
      )}
    >
      <header className="flex items-center justify-between px-1 pt-1">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            claseBadgeEtapa(etapa)
          )}
        >
          {etiquetaEtapa(etapa)}
        </span>
        <span data-conteo className="text-xs font-medium text-slate-500">
          {leads.length}
        </span>
      </header>

      {leads.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-2 py-4 text-center text-xs text-slate-400">
          Sin leads
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {leads.map((lead) => (
            <TarjetaLead key={lead.id} lead={lead} onMover={onMover} />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Kanban del asesor: columnas con scroll horizontal (una por etapa, en el
 * orden del pipeline). Movimiento entre etapas por drag (escritorio, y en
 * táctil con press de 250 ms) o por el menú «⋮ → Mover a…» de cada tarjeta.
 * El movimiento es optimista: si el servidor falla, se revierte con toast.
 */
export function KanbanLeads({ leads }: { leads: LeadKanban[] }) {
  const [, iniciarTransicion] = useTransition()
  const [leadsVisibles, aplicarMovimiento] = useOptimistic(
    leads,
    (estado, movimiento: { id: string; etapa: EtapaLead }) =>
      estado.map((lead) =>
        lead.id === movimiento.id ? { ...lead, etapa: movimiento.etapa } : lead
      )
  )

  const sensores = useSensors(
    // distance 8: un click/tap simple NO inicia drag (deja pasar el menú ⋮).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // En táctil: press de 250 ms para arrastrar sin secuestrar el scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  )

  // Solo las 5 etapas activas tienen columna: un lead cerrado (o, en teoria,
  // uno que siga en 'apartado' de antes de la migracion 0012) simplemente no
  // encuentra bucket aqui y desaparece del tablero -- ya no es trabajo
  // pendiente. Sigue siendo consultable desde la lista de leads cerrados.
  const columnas = useMemo(() => {
    const porEtapa = new Map<EtapaLead, LeadKanban[]>(ETAPAS_KANBAN.map((e) => [e, []]))
    for (const lead of leadsVisibles) {
      porEtapa.get(lead.etapa as EtapaLead)?.push(lead)
    }
    return porEtapa
  }, [leadsVisibles])

  function mover(lead: LeadKanban, etapa: EtapaLead) {
    if (lead.etapa === etapa) return
    iniciarTransicion(async () => {
      aplicarMovimiento({ id: lead.id, etapa })
      const resultado = await cambiarEtapa(lead.id, etapa)
      if ('error' in resultado) {
        // Al terminar la transición el estado optimista se revierte solo.
        toast.error(resultado.error)
        return
      }
      toast.success(`${lead.nombre} → ${etiquetaEtapa(etapa)}`)
    })
  }

  function alTerminarArrastre(evento: DragEndEvent) {
    const { active, over } = evento
    if (!over) return
    const lead = leadsVisibles.find((l) => l.id === active.id)
    const etapa = String(over.id)
    if (!lead || !(ETAPAS_KANBAN as readonly string[]).includes(etapa)) return
    mover(lead, etapa as EtapaLead)
  }

  return (
    <DndContext sensors={sensores} onDragEnd={alTerminarArrastre}>
      {/* -mx-4/px-4: el carrusel sangra hasta los bordes de la columna
          angosta del layout del asesor. */}
      <div className="-mx-4 flex snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-2">
        {ETAPAS_KANBAN.map((etapa) => (
          <ColumnaEtapa
            key={etapa}
            etapa={etapa}
            leads={columnas.get(etapa) ?? []}
            onMover={mover}
          />
        ))}
      </div>
    </DndContext>
  )
}
