'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlarmClock, Check, Plus, X } from 'lucide-react'

import { marcarRecordatorio } from '@/lib/recordatorios/acciones'
import { estaVencido, etiquetaFechaRecordatorio } from '@/lib/recordatorios/formato'
import { cn } from '@/lib/utils'
import { HojaRecordatorio } from '@/components/recordatorios/hoja-recordatorio'
import {
  EVENTO_SUGERIR_RECORDATORIO,
  type DetalleSugerirRecordatorio,
} from '@/components/recordatorios/sugerir'

export type RecordatorioFicha = {
  id: string
  fecha_hora: string
  nota: string
}

/**
 * El follow-up pactado en la ficha del lead (ronda 2): muestra el próximo
 * recordatorio pendiente con salidas de un toque (ya lo hice / cancelar), o
 * el botón para pactar uno. Además escucha la sugerencia de las otras hojas
 * (ver sugerir.ts) y abre la suya — así «registré un contacto» desemboca en
 * «¿cuándo es el siguiente?» sin acoplar los componentes.
 */
export function CardRecordatorio({
  leadId,
  leadNombre,
  recordatorio,
}: {
  leadId: string
  leadNombre: string
  recordatorio: RecordatorioFicha | null
}) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()
  const [hojaAbierta, setHojaAbierta] = useState(false)

  useEffect(() => {
    function alSugerir(evento: Event) {
      const detalle = (evento as CustomEvent<DetalleSugerirRecordatorio>).detail
      if (detalle?.leadId === leadId) setHojaAbierta(true)
    }
    window.addEventListener(EVENTO_SUGERIR_RECORDATORIO, alSugerir)
    return () => window.removeEventListener(EVENTO_SUGERIR_RECORDATORIO, alSugerir)
  }, [leadId])

  function resolver(estado: 'hecho' | 'cancelado') {
    if (!recordatorio) return
    iniciarTransicion(async () => {
      const resultado = await marcarRecordatorio(recordatorio.id, leadId, estado)
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success(estado === 'hecho' ? 'Follow-up hecho' : 'Recordatorio cancelado')
      router.refresh()
    })
  }

  const vencido = recordatorio ? estaVencido(recordatorio.fecha_hora, new Date()) : false

  return (
    <>
      {recordatorio ? (
        <div
          className={cn(
            'flex items-start gap-3 rounded-xl p-3 ring-1',
            vencido ? 'bg-red-50 ring-red-200' : 'bg-white ring-slate-200'
          )}
        >
          <AlarmClock
            aria-hidden
            className={cn('mt-0.5 size-4 shrink-0', vencido ? 'text-red-600' : 'text-slate-500')}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">
              Follow-up{' '}
              <span suppressHydrationWarning className={cn(vencido && 'text-red-700')}>
                {etiquetaFechaRecordatorio(recordatorio.fecha_hora, new Date())}
              </span>
              {vencido ? ' · vencido' : ''}
            </p>
            {recordatorio.nota ? (
              <p className="mt-0.5 text-xs text-slate-500">{recordatorio.nota}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => resolver('hecho')}
              aria-label="Marcar follow-up como hecho"
              className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <Check aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => resolver('cancelado')}
              aria-label="Cancelar recordatorio"
              className="flex size-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setHojaAbierta(true)}
          className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900"
        >
          <Plus aria-hidden className="size-4" />
          Pactar el siguiente follow-up
        </button>
      )}

      <HojaRecordatorio
        leadId={leadId}
        leadNombre={leadNombre}
        open={hojaAbierta}
        onOpenChange={setHojaAbierta}
      />
    </>
  )
}
