'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { reagendarVisita } from '@/lib/visitas/acciones'
import { DURACION_MIN_DEFAULT, validarDatosVisita } from '@/lib/visitas/validacion'
import {
  armarMensajeConfirmacionVisita,
  armarUrlConfirmacionVisita,
} from '@/components/visitas/confirmacion-whatsapp'
import {
  convertirFechaHoraMonterreyAIso,
  descomponerFechaIsoMonterrey,
  fechaHoyMonterrey,
} from '@/components/visitas/zona-horaria-monterrey'
import { CamposFechaHoraVisita } from '@/components/visitas/campos-fecha-hora-visita'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type Props = {
  visitaId: string
  leadNombre: string
  telefono: string | null
  asesorNombre: string
  propiedadTitulo: string | null
  /** Fecha/hora ISO 8601 (UTC) actual de la visita — precarga los campos. */
  fechaActualIso: string
  duracionActualMin: number
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}

/**
 * Hoja de REAGENDAR: misma cara que `HojaAgendarVisita` para fecha/hora/
 * duración (comparte `CamposFechaHoraVisita`, así que la conversión de zona
 * horaria y las opciones de duración viven en un solo lugar), pero:
 *  - No tiene botón propio: la abre `ListaVisitasLead` (open/onOpenChange
 *    controlados), porque el trigger es la fila de la visita en la lista,
 *    no un botón fijo de la barra de acciones.
 *  - No toca la propiedad de la visita: `reagendarVisita` solo acepta
 *    fecha y duración (ver `src/lib/visitas/acciones.ts`).
 *  - Se precarga con la fecha/hora/duración ACTUALES de la visita
 *    (`descomponerFechaIsoMonterrey`, la inversa de la conversión que usa
 *    `HojaAgendarVisita`) en vez de arrancar vacía.
 *
 * Fecha y hora son estado controlado por el mismo motivo que en
 * `HojaAgendarVisita`: un error de servidor no debe dejar los campos en
 * blanco (bug de React 19 con `<form action>` sobre inputs no controlados).
 */
export function HojaReagendarVisita({
  visitaId,
  leadNombre,
  telefono,
  asesorNombre,
  propiedadTitulo,
  fechaActualIso,
  duracionActualMin,
  abierto,
  onAbiertoChange,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const precarga = useMemo(() => descomponerFechaIsoMonterrey(fechaActualIso), [fechaActualIso])
  const [fecha, setFecha] = useState(precarga.fecha)
  const [hora, setHora] = useState(precarga.hora)
  const [duracionMin, setDuracionMin] = useState<number>(duracionActualMin || DURACION_MIN_DEFAULT)

  const minFecha = useMemo(() => fechaHoyMonterrey(), [])

  function alCambiarAbierto(abrir: boolean) {
    onAbiertoChange(abrir)
    if (!abrir) {
      setError(null)
      setFecha(precarga.fecha)
      setHora(precarga.hora)
      setDuracionMin(duracionActualMin || DURACION_MIN_DEFAULT)
    }
  }

  function alEnviar() {
    setError(null)

    if (!fecha || !hora) {
      setError('Elige fecha y hora')
      return
    }

    // Mismo cuidado de zona horaria que HojaAgendarVisita: lo tecleado
    // siempre significa hora de America/Monterrey, nunca la del dispositivo.
    const fechaISO = convertirFechaHoraMonterreyAIso(fecha, hora)
    if (!fechaISO) {
      setError('La fecha no es válida')
      return
    }

    const validacion = validarDatosVisita({ fecha: fechaISO, duracionMin })
    if ('error' in validacion) {
      setError(validacion.error)
      return
    }

    iniciarTransicion(async () => {
      const resultado = await reagendarVisita(visitaId, { fecha: fechaISO, duracionMin })

      if ('error' in resultado) {
        setError(resultado.error)
        return
      }

      alCambiarAbierto(false)

      const mensaje = armarMensajeConfirmacionVisita({
        leadNombre,
        fecha: fechaISO,
        duracionMin,
        propiedadTitulo,
        asesorNombre,
      })

      toast.success('Visita reagendada', {
        action: telefono
          ? {
              label: 'Confirmar por WhatsApp',
              onClick: () => {
                window.open(
                  armarUrlConfirmacionVisita(telefono, mensaje),
                  '_blank',
                  'noopener,noreferrer'
                )
              },
            }
          : undefined,
      })
      router.refresh()
    })
  }

  return (
    <Sheet open={abierto} onOpenChange={alCambiarAbierto}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Reagendar visita</SheetTitle>
          <SheetDescription>
            La fecha y hora anteriores se reemplazan por las nuevas.
          </SheetDescription>
        </SheetHeader>

        <form
          action={alEnviar}
          className="grid gap-4 overflow-y-auto px-4 pb-4"
        >
          <CamposFechaHoraVisita
            idPrefijo="reagendar"
            fecha={fecha}
            hora={hora}
            duracionMin={duracionMin}
            onFechaChange={setFecha}
            onHoraChange={setHora}
            onDuracionChange={setDuracionMin}
            minFecha={minFecha}
            disabled={pendiente}
          />

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <SheetFooter className="p-0 pt-1">
            <Button type="submit" size="lg" disabled={pendiente} className="w-full">
              {pendiente ? 'Reagendando…' : 'Confirmar cambio'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
