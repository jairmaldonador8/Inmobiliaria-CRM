'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, Home } from 'lucide-react'

import { cancelarVisita } from '@/lib/visitas/acciones'
import type { VisitaLead } from '@/lib/visitas/consultas'
import {
  claseBadgeEstadoVisita,
  etiquetaEstadoVisita,
  formatearDuracionVisita,
  formatearFechaVisita,
} from '@/lib/visitas/formato-visita'
import { HojaReagendarVisita } from '@/components/visitas/hoja-reagendar-visita'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Props = {
  leadNombre: string
  telefono: string | null
  asesorNombre: string
  /** user_id del asesor dueño del lead — habilita la advertencia de conflicto de agenda (Task 9) en `HojaReagendarVisita`; opcional. */
  asesorId?: string
  visitas: VisitaLead[]
}

/**
 * Lista de visitas del lead, con Reagendar/Cancelar para las `agendada`.
 * Antes de esta corrección, `reagendarVisita` y `cancelarVisita` no las
 * llamaba nadie: un error al teclear la hora dejaba la visita agendada
 * para siempre, sin forma de corregirla ni cancelarla.
 *
 * Reagendar reutiliza `HojaReagendarVisita` (una sola instancia, controlada
 * por `visitaEnReagenda`) en vez de una hoja por fila. Cancelar pide
 * confirmación explícita (`Dialog`, mismo patrón que
 * `MenuAccionesPlantilla`/`MenuAccionesAsesor`): es destructivo desde el
 * punto de vista del lead, la cita desaparece de la lista.
 */
export function ListaVisitasLead({ leadNombre, telefono, asesorNombre, asesorId, visitas }: Props) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  const [visitaEnReagenda, setVisitaEnReagenda] = useState<VisitaLead | null>(null)
  const [visitaPorCancelar, setVisitaPorCancelar] = useState<VisitaLead | null>(null)

  function alConfirmarCancelar() {
    if (!visitaPorCancelar) return
    const visita = visitaPorCancelar

    iniciarTransicion(async () => {
      const resultado = await cancelarVisita(visita.id)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success('Visita cancelada')
      setVisitaPorCancelar(null)
      router.refresh()
    })
  }

  if (visitas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
        Sin visitas agendadas todavía
      </p>
    )
  }

  return (
    <>
      <ul data-lista-visitas className="flex flex-col gap-2">
        {visitas.map((visita) => {
          const esAgendada = visita.estado === 'agendada'
          return (
            <li
              key={visita.id}
              data-visita={visita.estado}
              className={cn(
                'flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 sm:flex-row sm:items-center sm:justify-between',
                esAgendada ? 'ring-slate-200' : 'ring-slate-100 opacity-70'
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p
                    className={cn(
                      'text-sm font-medium text-slate-900',
                      !esAgendada && 'line-through decoration-slate-400'
                    )}
                  >
                    {formatearFechaVisita(visita.fecha)}
                  </p>
                  <Badge className={claseBadgeEstadoVisita(visita.estado)}>
                    {etiquetaEstadoVisita(visita.estado)}
                  </Badge>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock aria-hidden className="size-3.5" />
                    {formatearDuracionVisita(visita.duracionMin)}
                  </span>
                  {visita.propiedadTitulo ? (
                    <span className="inline-flex items-center gap-1">
                      <Home aria-hidden className="size-3.5" />
                      {visita.propiedadTitulo}
                    </span>
                  ) : null}
                </p>
              </div>

              {esAgendada ? (
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisitaEnReagenda(visita)}
                  >
                    Reagendar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setVisitaPorCancelar(visita)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {visitaEnReagenda ? (
        <HojaReagendarVisita
          key={visitaEnReagenda.id}
          visitaId={visitaEnReagenda.id}
          leadNombre={leadNombre}
          telefono={telefono}
          asesorNombre={asesorNombre}
          asesorId={asesorId}
          propiedadTitulo={visitaEnReagenda.propiedadTitulo}
          fechaActualIso={visitaEnReagenda.fecha}
          duracionActualMin={visitaEnReagenda.duracionMin}
          abierto={visitaEnReagenda !== null}
          onAbiertoChange={(abrir) => {
            if (!abrir) setVisitaEnReagenda(null)
          }}
        />
      ) : null}

      <Dialog
        open={visitaPorCancelar !== null}
        onOpenChange={(abrir) => {
          if (!abrir) setVisitaPorCancelar(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar visita</DialogTitle>
            <DialogDescription>
              {visitaPorCancelar
                ? `La visita del ${formatearFechaVisita(visitaPorCancelar.fecha)} desaparecerá de la agenda. Esta acción no se puede deshacer.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pendiente}
              onClick={() => setVisitaPorCancelar(null)}
            >
              Volver
            </Button>
            <Button variant="destructive" disabled={pendiente} onClick={alConfirmarCancelar}>
              {pendiente ? 'Cancelando…' : 'Sí, cancelar visita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
