'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, X } from 'lucide-react'

import { agendarVisita } from '@/lib/visitas/acciones'
import { DURACION_MIN_DEFAULT } from '@/lib/visitas/validacion'
import {
  armarMensajeConfirmacionVisita,
  armarUrlConfirmacionVisita,
} from '@/components/visitas/confirmacion-whatsapp'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type OpcionPropiedadVisita = { id: string; titulo: string }

const MAX_RESULTADOS = 7

/** Opciones de duración razonables para una visita, en minutos. */
const OPCIONES_DURACION = [30, 45, 60, 90, 120] as const

const ETIQUETA_DURACION: Record<number, string> = {
  30: '30 min',
  45: '45 min',
  60: '1 hora',
  90: '1 h 30 min',
  120: '2 horas',
}

type Props = {
  leadId: string
  leadNombre: string
  /** Teléfono normalizado (52XXXXXXXXXX); sin él no se ofrece confirmar por WhatsApp. */
  telefono: string | null
  asesorNombre: string
  /**
   * propiedad_id del lead: si existe, la visita la referencia por default
   * (sin combobox) — mismo patrón condicional que `SheetSeguimiento`.
   */
  propiedadLeadId: string | null
  propiedadLeadTitulo: string | null
  propiedades: OpcionPropiedadVisita[]
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
 */
export function HojaAgendarVisita({
  leadId,
  leadNombre,
  telefono,
  asesorNombre,
  propiedadLeadId,
  propiedadLeadTitulo,
  propiedades,
}: Props) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

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

  const itemsDuracion = OPCIONES_DURACION.map((min) => ({
    value: String(min),
    label: ETIQUETA_DURACION[min],
  }))

  function alCambiarAbierto(abrir: boolean) {
    setAbierto(abrir)
    if (!abrir) {
      setError(null)
      setDuracionMin(DURACION_MIN_DEFAULT)
      setBusquedaPropiedad('')
      setPropiedadSeleccionada(null)
    }
  }

  function alEnviar(formData: FormData) {
    setError(null)
    const fecha = String(formData.get('fecha') ?? '')
    const hora = String(formData.get('hora') ?? '')

    if (!fecha || !hora) {
      setError('Elige fecha y hora')
      return
    }

    // ⚠️ CRÍTICO — zona horaria: los inputs date/time NO llevan offset, solo
    // valores locales del navegador. `new Date('YYYY-MM-DDTHH:mm')` (forma
    // fecha+hora, SIN sufijo de zona) se interpreta como HORA LOCAL del
    // navegador — a diferencia de una fecha sola ('YYYY-MM-DD'), que Date sí
    // trata como UTC. Como el asesor usa el navegador en Monterrey,
    // `new Date(...)` resuelve el offset correcto y `.toISOString()` entrega
    // el instante UTC real que espera el servidor (Vercel corre en UTC): la
    // hora que el usuario ve en la hoja es la hora que queda guardada.
    const fechaLocal = new Date(`${fecha}T${hora}`)
    if (Number.isNaN(fechaLocal.getTime())) {
      setError('La fecha no es válida')
      return
    }
    const fechaISO = fechaLocal.toISOString()

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

        <form action={alEnviar} className="grid gap-4 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="visita-fecha">Fecha</Label>
              <Input id="visita-fecha" name="fecha" type="date" required disabled={pendiente} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="visita-hora">Hora</Label>
              <Input id="visita-hora" name="hora" type="time" required disabled={pendiente} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="visita-duracion">Duración</Label>
            <Select
              items={itemsDuracion}
              value={String(duracionMin)}
              onValueChange={(v) => setDuracionMin(Number(v))}
              disabled={pendiente}
            >
              <SelectTrigger id="visita-duracion" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemsDuracion.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
