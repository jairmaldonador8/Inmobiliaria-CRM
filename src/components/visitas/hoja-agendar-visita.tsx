'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, X } from 'lucide-react'

import { agendarVisita } from '@/lib/visitas/acciones'
import { DURACION_MIN_DEFAULT, validarDatosVisita } from '@/lib/visitas/validacion'
import {
  armarMensajeConfirmacionVisita,
  armarUrlConfirmacionVisita,
} from '@/lib/visitas/confirmacion-whatsapp'
import { convertirFechaHoraMonterreyAIso, fechaHoyMonterrey } from '@/lib/fechas/monterrey'
import { CamposFechaHoraVisita } from '@/components/visitas/campos-fecha-hora-visita'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export type OpcionPropiedadVisita = { id: string; titulo: string }

const MAX_RESULTADOS = 7

type Props = {
  leadId: string
  leadNombre: string
  /** Teléfono normalizado (52XXXXXXXXXX); sin él no se ofrece confirmar por WhatsApp. */
  telefono: string | null
  asesorNombre: string
  /**
   * user_id del asesor dueño del lead — habilita la advertencia de
   * conflicto de agenda (Task 9) en `CamposFechaHoraVisita`. Opcional: sin
   * él, simplemente no se consulta disponibilidad (mismo comportamiento que
   * antes de la Task 9).
   */
  asesorId?: string
  /**
   * propiedad_id del lead: si existe, la visita la referencia por default
   * (sin combobox) — mismo patrón condicional que `SheetSeguimiento`.
   */
  propiedadLeadId: string | null
  propiedadLeadTitulo: string | null
  propiedades: OpcionPropiedadVisita[]
  /**
   * Motivo por el que agendar está deshabilitado (p. ej. el lead sigue en
   * la bandeja, sin asesor asignado); `null`/`undefined` = habilitado. Con
   * motivo, el botón se ve deshabilitado y NUNCA monta la hoja — evita que
   * el admin llene todo el formulario para enterarse hasta el submit.
   */
  deshabilitadoMotivo?: string | null
}

/**
 * Botón «Agendar visita» de la barra de acciones del lead: bottom sheet con
 * fecha, hora, duración y propiedad opcional. El requisito del cliente es
 * explícito — agendar vive junto al chat con el lead, no en una sección
 * aparte — por eso este componente se monta en la misma barra que
 * `BotonWhatsApp`.
 *
 * Al agendar con éxito, el toast ofrece (NUNCA automático) mandar la
 * confirmación por WhatsApp con el mensaje ya prellenado.
 *
 * Fecha y hora son estado controlado (no `defaultValue`): con
 * `<form action={fn}>`, React 19 resetea los inputs no controlados en
 * cuanto la función retorna, incluso si hubo error — antes, un error de
 * validación («La fecha debe ser futura») dejaba Fecha y Hora en blanco y
 * obligaba a teclear todo de nuevo. Los campos viven en
 * `CamposFechaHoraVisita`, COMPARTIDO con `HojaReagendarVisita` para no
 * duplicar la lógica de duración ni la conversión de zona horaria.
 */
export function HojaAgendarVisita({
  leadId,
  leadNombre,
  telefono,
  asesorNombre,
  asesorId,
  propiedadLeadId,
  propiedadLeadTitulo,
  propiedades,
  deshabilitadoMotivo,
}: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [duracionMin, setDuracionMin] = useState<number>(DURACION_MIN_DEFAULT)

  // Combobox simple de propiedad (mismo patrón que SheetSeguimiento).
  const [busquedaPropiedad, setBusquedaPropiedad] = useState('')
  const [propiedadSeleccionada, setPropiedadSeleccionada] =
    useState<OpcionPropiedadVisita | null>(null)

  const resultadosPropiedad = useMemo(() => {
    const termino = busquedaPropiedad.trim().toLowerCase()
    if (!termino) return []
    return propiedades
      .filter((p) => p.titulo.toLowerCase().includes(termino))
      .slice(0, MAX_RESULTADOS)
  }, [busquedaPropiedad, propiedades])

  // `min` del input de fecha: hoy en America/Monterrey (no la del
  // dispositivo), calculado una sola vez por apertura de la hoja.
  const minFecha = useMemo(() => fechaHoyMonterrey(), [])

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setFecha('')
      setHora('')
      setDuracionMin(DURACION_MIN_DEFAULT)
      setBusquedaPropiedad('')
      setPropiedadSeleccionada(null)
    }
  }

  function alEnviar() {
    setError(null)

    if (!fecha || !hora) {
      setError('Elige fecha y hora')
      return
    }

    // ⚠️ CRÍTICO — zona horaria: los inputs date/time NO llevan offset, solo
    // valores "de pared" sin zona. NO se interpretan con la zona del
    // DISPOSITIVO (un asesor de viaje, en un municipio fronterizo con
    // horario de verano de EE. UU., o con el equipo mal configurado
    // agendaría a la hora equivocada) — toda la app muestra horas en
    // America/Monterrey, así que lo tecleado también significa esa zona.
    // Ver `src/lib/fechas/monterrey.ts` para el cálculo del offset real.
    const fechaISO = convertirFechaHoraMonterreyAIso(fecha, hora)
    if (!fechaISO) {
      setError('La fecha no es válida')
      return
    }

    // Validación de conveniencia en cliente (mejor UX) — la de
    // `agendarVisita` en el servidor sigue siendo la que manda.
    const validacion = validarDatosVisita({ fecha: fechaISO, duracionMin })
    if ('error' in validacion) {
      setError(validacion.error)
      return
    }

    const propiedadId = propiedadLeadId ?? propiedadSeleccionada?.id ?? null
    const propiedadTitulo = propiedadLeadTitulo ?? propiedadSeleccionada?.titulo ?? null

    iniciarTransicion(async () => {
      const resultado = await agendarVisita({
        leadId,
        propiedadId,
        fecha: fechaISO,
        duracionMin,
      })

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

      // Confirmar por WhatsApp es SIEMPRE opcional para el asesor — nunca
      // se abre automático. Sin teléfono, el toast no ofrece la acción.
      toast.success('Visita agendada', {
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

  if (deshabilitadoMotivo) {
    return (
      <span
        title={deshabilitadoMotivo}
        aria-label={`Agendar visita: ${deshabilitadoMotivo}`}
        className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-input bg-slate-50 text-xs font-medium text-slate-400"
      >
        <CalendarClock aria-hidden className="size-5" />
        Agendar visita
      </span>
    )
  }

  return (
    <Sheet open={abierto} onOpenChange={alCambiarAbierto}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            className="h-14 flex-col gap-1 rounded-xl bg-white text-xs font-medium"
          />
        }
      >
        <CalendarClock aria-hidden className="size-5" />
        Agendar visita
      </SheetTrigger>

      <SheetContent
        side="bottom"
        className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <SheetHeader className="pb-0">
          <SheetTitle>Agendar visita</SheetTitle>
          <SheetDescription>
            Al confirmar, se ofrece avisarle al lead por WhatsApp.
          </SheetDescription>
        </SheetHeader>

        <form
          action={alEnviar}
          className="grid gap-4 overflow-y-auto px-4 pb-4"
        >
          <CamposFechaHoraVisita
            idPrefijo="visita"
            fecha={fecha}
            hora={hora}
            duracionMin={duracionMin}
            onFechaChange={setFecha}
            onHoraChange={setHora}
            onDuracionChange={setDuracionMin}
            minFecha={minFecha}
            disabled={pendiente}
            asesorId={asesorId}
            asesorNombre={asesorNombre}
          />

          {/* Con propiedad de interés ya definida en el lead, la visita la
              referencia solo — sin pedir nada más. */}
          {propiedadLeadId === null ? (
            <div className="grid gap-2">
              <Label htmlFor="visita-propiedad">Propiedad (opcional)</Label>
              {propiedadSeleccionada ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-input bg-slate-50 px-2.5 py-1.5 text-sm">
                  <span className="min-w-0 truncate">{propiedadSeleccionada.titulo}</span>
                  <button
                    type="button"
                    aria-label="Quitar propiedad"
                    onClick={() => setPropiedadSeleccionada(null)}
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    id="visita-propiedad"
                    type="search"
                    placeholder="Buscar por título…"
                    value={busquedaPropiedad}
                    onChange={(e) => setBusquedaPropiedad(e.target.value)}
                    disabled={pendiente}
                    autoComplete="off"
                  />
                  {resultadosPropiedad.length > 0 ? (
                    <ul className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
                      {resultadosPropiedad.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPropiedadSeleccionada(p)
                              setBusquedaPropiedad('')
                            }}
                            className="w-full truncate px-2.5 py-1.5 text-left hover:bg-slate-100"
                          >
                            {p.titulo}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : busquedaPropiedad.trim() ? (
                    <p className="text-xs text-slate-500">Sin propiedades con ese título</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <SheetFooter className="p-0 pt-1">
            <Button type="submit" size="lg" disabled={pendiente} className="w-full">
              {pendiente ? 'Agendando…' : 'Confirmar visita'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
