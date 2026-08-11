'use client'

import Link from 'next/link'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
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
      {/*
        Enlace que cubre la tarjeta entera: tocarla abre el detalle del lead.
        Antes la ÚNICA ruta al detalle era el menú ⋮ → «Ver detalle», y en el
        teléfono el asesor tocaba la tarjeta y no pasaba nada.

        Va como capa (`absolute inset-0`) y no envolviendo el contenido para
        no meter un <a> alrededor del botón del menú, que sería HTML inválido
        (enlace con botón dentro) y dejaría el menú inservible. El menú sube a
        `z-20` para quedar por encima.

        `pointer-events-none` mientras se arrastra: sin eso, soltar la tarjeta
        al terminar un drag dispara el click del enlace y navega sin querer.
      */}
      <Link
        href={`/asesor/leads/${lead.id}`}
        aria-label={`Ver ${lead.nombre}`}
        className={cn('absolute inset-0 z-10 rounded-lg', isDragging && 'pointer-events-none')}
      />

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
                // relative z-20: por encima del enlace que cubre la tarjeta.
                className="relative z-20 -mt-1 -mr-1 shrink-0 text-slate-500"
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

/**
 * Iniciales para el avatar: «Lucía Vega Treviño» → «LV».
 *
 * Solo palabras que EMPIEZAN por letra: hay nombres reales con prefijos y
 * separadores («TEST · Mariana Del Bosque») que daban iniciales como «T·».
 */
function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p))
  if (palabras.length === 0) return '?'
  return (palabras[0][0] + (palabras[1]?.[0] ?? '')).toUpperCase()
}

/**
 * Fila de lead del TELÉFONO: ancho completo, con avatar y las etiquetas en
 * una sola línea. Misma información que la tarjeta del tablero, pero leída
 * de arriba abajo en vez de dentro de una columna de 280px.
 */
function FilaLeadMovil({ lead, onMover }: { lead: LeadKanban; onMover: MoverLead }) {
  const punto = puntoSeguimiento(lead)
  const antiguedad = formatDistanceToNow(new Date(lead.creado_en), {
    addSuffix: true,
    locale: es,
  })

  return (
    <li
      data-lead-movil={lead.id}
      className="relative flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200"
    >
      {/* Mismo patrón que la tarjeta del tablero: el enlace es una CAPA sobre
          la fila, no un <a> envolvente, para no anidar el botón del menú
          dentro de un enlace (HTML inválido y menú inservible). */}
      <Link
        href={`/asesor/leads/${lead.id}`}
        aria-label={`Ver ${lead.nombre}`}
        className="absolute inset-0 z-10 rounded-xl"
      />

      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600"
      >
        {iniciales(lead.nombre)}
      </span>

      <div className="min-w-0 flex-1">
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
            <span className="truncate">{lead.propiedad_titulo}</span>
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
              claseBadgeEtapa(lead.etapa)
            )}
          >
            {etiquetaEtapa(lead.etapa)}
          </span>
          <Badge variant="secondary" className="px-1.5 text-[0.6875rem]">
            {etiquetaFuenteConDetalle(lead.fuente, lead.fuente_detalle)}
          </Badge>
          <EtiquetaClasificacionEB
            clasificacion={lead.clasificacion_eb}
            className="px-1.5 text-[0.6875rem]"
          />
          <span suppressHydrationWarning className="text-[0.6875rem] text-slate-400">
            {antiguedad}
          </span>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acciones para ${lead.nombre}`}
              className="relative z-20 -mt-1 -mr-1 shrink-0 text-slate-500"
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
              {ETAPAS_SELECCIONABLES.filter((etapa) => etapa !== lead.etapa).map((etapa) => (
                <DropdownMenuItem key={etapa} onClick={() => onMover(lead, etapa)}>
                  {etiquetaEtapa(etapa)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

/**
 * Leads del TELÉFONO (propuesta L1): chips de etapa con su conteo + lista
 * vertical. Sustituye al tablero hasta `lg` porque el tablero mide 1 480px
 * (5 columnas de 280) y en una pantalla de 390 obliga a deslizar a ciegas
 * para saber siquiera cuántos leads hay en cada etapa.
 *
 * El filtro vive aquí y no en la URL a propósito: es un vistazo, no un
 * destino que valga la pena compartir o al que volver con el botón atrás.
 */
function ListaLeadsMovil({
  leads,
  columnas,
  onMover,
}: {
  leads: LeadKanban[]
  columnas: Map<EtapaLead, LeadKanban[]>
  onMover: MoverLead
}) {
  const [filtro, setFiltro] = useState<EtapaLead | 'todos'>('todos')

  const visibles = useMemo(() => {
    const base = filtro === 'todos' ? leads : (columnas.get(filtro) ?? [])
    // Orden por urgencia: primero el que lleva más tiempo sin que nadie lo
    // toque. `ultimo_seguimiento` si lo tuvo; si nunca, su fecha de alta —
    // que es exactamente la referencia con la que `puntoSeguimiento` decide
    // el punto ámbar o rojo, así que la lista y los puntos cuentan lo mismo.
    return [...base].sort(
      (a, b) =>
        new Date(a.ultimo_seguimiento ?? a.creado_en).getTime() -
        new Date(b.ultimo_seguimiento ?? b.creado_en).getTime()
    )
  }, [filtro, leads, columnas])

  const sinSeguimiento = leads.filter((lead) => puntoSeguimiento(lead) !== null).length

  // Sin un solo lead no hay nada que filtrar: una fila de chips en cero solo
  // sería ruido delante del mensaje que importa.
  if (leads.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-400 lg:hidden">
        Aún no tienes leads asignados
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3 lg:hidden">
      <p className="text-sm text-slate-500">
        {leads.length} activo{leads.length === 1 ? '' : 's'}
        {sinSeguimiento > 0 ? ` · ${sinSeguimiento} sin seguimiento` : ''}
      </p>

      {/* -mx-4/px-4: los chips sangran hasta los bordes de la pantalla, así
          se ve que la fila sigue. `w-0 min-w-full` para que la fila scrollee
          por dentro en vez de estirar la página (mismo defecto que tenía la
          tira de fotos de la ficha de propiedad). */}
      <div className="-mx-4 w-0 min-w-[calc(100%+2rem)] overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2 pb-1">
          <ChipEtapa
            activo={filtro === 'todos'}
            conteo={leads.length}
            onClick={() => setFiltro('todos')}
          >
            Todos
          </ChipEtapa>
          {ETAPAS_KANBAN.map((etapa) => (
            <ChipEtapa
              key={etapa}
              activo={filtro === etapa}
              conteo={columnas.get(etapa)?.length ?? 0}
              onClick={() => setFiltro(etapa)}
            >
              {etiquetaEtapa(etapa)}
            </ChipEtapa>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-400">
          {filtro === 'todos' ? 'Sin leads activos' : `Sin leads en ${etiquetaEtapa(filtro)}`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((lead) => (
            <FilaLeadMovil key={lead.id} lead={lead} onMover={onMover} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ChipEtapa({
  activo,
  conteo,
  onClick,
  children,
}: {
  activo: boolean
  conteo: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      // min-h-9: objetivo táctil cómodo sin engordar la fila.
      className={cn(
        'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium whitespace-nowrap transition-colors',
        activo
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      )}
    >
      {children}
      <span className={cn('tabular-nums', activo ? 'text-white/70' : 'text-slate-400')}>
        {conteo}
      </span>
    </button>
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

  // El `id` fijo del DndContext no es cosmético: sin él dnd-kit numera sus
  // ids de accesibilidad con un contador global que arranca distinto en el
  // servidor y en el cliente, y React tiraba un error de hidratación real en
  // cada carga del kanban (aria-describedby="DndDescribedBy-0" contra
  // "DndDescribedBy-3", de los que React avisa «this won't be patched up»).
  // Con un id estable los dos lados generan el mismo.
  return (
    <>
      {/* Teléfono: lista con filtro por etapa (propuesta L1). */}
      <ListaLeadsMovil leads={leadsVisibles} columnas={columnas} onMover={mover} />

      {/*
        Escritorio: el tablero de siempre, intacto. Las dos ramas se alternan
        con `lg:hidden` / `hidden lg:block` y NO midiendo el ancho en
        JavaScript, para que el HTML del servidor y el del cliente coincidan.
        Comparten el MISMO estado optimista y la misma función `mover`: un
        lead movido desde el teléfono y otro desde la computadora pasan por
        el mismo camino, sin una segunda copia de la lógica que se desincronice.
      */}
      <div className="hidden lg:block">
        <DndContext id="kanban-leads" sensors={sensores} onDragEnd={alTerminarArrastre}>
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
      </div>
    </>
  )
}
