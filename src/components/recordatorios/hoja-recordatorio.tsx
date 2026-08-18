'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { crearRecordatorio } from '@/lib/recordatorios/acciones'
import {
  MAX_NOTA_RECORDATORIO,
  opcionesRapidas,
  type OpcionRapida,
} from '@/lib/recordatorios/formato'
import {
  convertirFechaHoraMonterreyAIso,
  fechaHoyMonterrey,
} from '@/lib/fechas/monterrey'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * Hoja «¿Cuándo le das el siguiente seguimiento?» (ronda 2). Modo controlado
 * siempre: la monta `CardRecordatorio`, que decide cuándo abrirla (botón
 * propio o sugerencia de otra hoja vía sugerir.ts).
 *
 * Las opciones rápidas y los inputs libres hablan en hora de MONTERREY
 * (formato.ts / monterrey.ts) — nunca la zona del dispositivo.
 */
export function HojaRecordatorio({
  leadId,
  leadNombre,
  open,
  onOpenChange,
}: {
  leadId: string
  leadNombre: string
  open: boolean
  onOpenChange: (abierta: boolean) => void
}) {
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  // Se calculan al abrir (dependen de la hora actual); mientras la hoja está
  // cerrada no hay razón de recalcular.
  const opciones = useMemo<OpcionRapida[]>(() => (open ? opcionesRapidas(new Date()) : []), [open])

  const [seleccionada, setSeleccionada] = useState<string | null>(null)
  const [fechaLibre, setFechaLibre] = useState(false)
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('09:00')
  const [nota, setNota] = useState('')

  function reiniciar() {
    setSeleccionada(null)
    setFechaLibre(false)
    setFecha('')
    setHora('09:00')
    setNota('')
  }

  function alCambiarAbierta(abierta: boolean) {
    if (!abierta) reiniciar()
    onOpenChange(abierta)
  }

  function guardar() {
    const fechaIso = fechaLibre
      ? fecha && hora
        ? convertirFechaHoraMonterreyAIso(fecha, hora)
        : null
      : seleccionada

    if (!fechaIso) {
      toast.error('Elige cuándo quieres el recordatorio')
      return
    }

    iniciarTransicion(async () => {
      const resultado = await crearRecordatorio(leadId, { fechaIso, nota })
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      toast.success('Follow-up pactado')
      alCambiarAbierta(false)
      router.refresh()
    })
  }

  const primerNombre = leadNombre.trim().split(/\s+/)[0] || 'este lead'

  return (
    <Sheet open={open} onOpenChange={alCambiarAbierta}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>¿Cuándo le das el siguiente seguimiento a {primerNombre}?</SheetTitle>
          <SheetDescription>
            Te lo recordamos con una notificación y en tu inicio.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {opciones.map((opcion) => (
              <button
                key={opcion.etiqueta}
                type="button"
                aria-pressed={!fechaLibre && seleccionada === opcion.fechaIso}
                onClick={() => {
                  setFechaLibre(false)
                  setSeleccionada(opcion.fechaIso)
                }}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-xs font-medium transition-colors',
                  !fechaLibre && seleccionada === opcion.fechaIso
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                {opcion.etiqueta}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={fechaLibre}
              onClick={() => setFechaLibre(true)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-xs font-medium transition-colors',
                fechaLibre
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              Elegir fecha…
            </button>
          </div>

          {fechaLibre ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="Fecha del recordatorio"
                min={fechaHoyMonterrey()}
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
              <input
                type="time"
                aria-label="Hora del recordatorio"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
            </div>
          ) : null}

          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={MAX_NOTA_RECORDATORIO}
            rows={2}
            placeholder="¿De qué trata? (p. ej. confirmar si la casa sigue disponible)"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
          />

          <Button
            type="button"
            size="lg"
            disabled={pendiente}
            onClick={guardar}
            className="w-full rounded-xl"
          >
            Guardar recordatorio
          </Button>

          <button
            type="button"
            disabled={pendiente}
            onClick={() => alCambiarAbierta(false)}
            className="self-center text-sm text-slate-500 underline-offset-4 hover:underline disabled:opacity-50"
          >
            Ahora no
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
