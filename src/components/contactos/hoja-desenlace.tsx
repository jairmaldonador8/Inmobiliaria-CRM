'use client'

import { useEffect, useState, useTransition, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, MessageCircle, PhoneOff, ThumbsDown } from 'lucide-react'

import { resolverContacto } from '@/lib/contactos/acciones'
import { sugerirRecordatorio } from '@/components/recordatorios/sugerir'
import {
  etiquetaResultado,
  type DesenlaceElegible,
} from '@/lib/contactos/formato'
import { Button } from '@/components/ui/button'
import { HojaAgendarVisita } from '@/components/visitas/hoja-agendar-visita'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * Todo lo que `HojaAgendarVisita` necesita, menos lo que ESTE componente
 * controla. `deshabilitadoMotivo` se re-declara aparte (abajo) en vez de
 * pasar en el spread: con motivo, la hoja de visita sale por un `return`
 * temprano ANTES de montar su `Sheet` y un `open` en true se ignoraría en
 * silencio — por eso aquí «Agendé una cita» lo intercepta con un toast en
 * vez de intentar abrirla (caso admin con lead aún en bandeja, desde que el
 * admin también usa esta hoja, 2026-08-17).
 */
type PropsVisita = Omit<
  ComponentProps<typeof HojaAgendarVisita>,
  'open' | 'onOpenChange' | 'onAgendada' | 'deshabilitadoMotivo'
>

type Props = PropsVisita & {
  /** Ver el comentario de PropsVisita. `null`/`undefined` = habilitado. */
  deshabilitadoMotivo?: string | null
  /**
   * `id` del contacto de WhatsApp sin reportar, o `null` si no hay. Lo
   * decide el SERVIDOR en cada render. El cliente nunca lo inventa: así una
   * recarga (o un `router.refresh()`) no pierde el pendiente.
   *
   * Es el ID y no un booleano a propósito: un pendiente puede ser sustituido
   * por OTRO pendiente sin que un booleano cambie nunca de valor (el asesor
   * pospone A, pasan >5 min, vuelve a tocar WhatsApp, A se degrada a
   * `sin_reporte` y entra B). Con el ID esa transición sí se ve.
   */
  contactoPendienteId: string | null
  /** Canal del pendiente: cambia el texto de la pregunta y el icono. */
  canalPendiente?: 'whatsapp' | 'llamada'
}

const OPCIONES: {
  desenlace: DesenlaceElegible
  Icono: typeof CalendarClock
}[] = [
  { desenlace: 'cita', Icono: CalendarClock },
  { desenlace: 'contesto', Icono: MessageCircle },
  { desenlace: 'no_contesto', Icono: PhoneOff },
  { desenlace: 'no_interesa', Icono: ThumbsDown },
]

/**
 * Dueño de LAS DOS hojas: la de desenlace («¿cómo te fue?») y la de agendar
 * visita. Van juntas porque comparten estado y la página del lead es un
 * Server Component, que no puede coordinarlas.
 *
 * Por eso este componente REEMPLAZA a `HojaAgendarVisita` en la rejilla 2×2
 * de acciones: monta él mismo el botón «Agendar visita» (mismo look, misma
 * posición) y le pasa la hoja en modo controlado. Montar los dos duplicaría
 * el botón.
 *
 * Flujo: el asesor toca WhatsApp → se va de la app → al volver, el efecto de
 * `visibilitychange` refresca y el servidor dice si hay pendiente → la hoja
 * pregunta cómo le fue.
 */
export function HojaDesenlace({
  contactoPendienteId,
  canalPendiente = 'whatsapp',
  deshabilitadoMotivo,
  ...propsVisita
}: Props) {
  const { leadId, leadNombre } = propsVisita
  const router = useRouter()
  const [pendiente, iniciarTransicion] = useTransition()

  // `pospuesto` es lo ÚNICO que el cliente decide: «ya respondí» o «ahora
  // no». La verdad de si hay pendiente siempre viene del servidor.
  const [pospuesto, setPospuesto] = useState(false)
  const [visitaAbierta, setVisitaAbierta] = useState(false)

  // Cuando cambia el contacto pendiente, lo pospuesto caduca. Se compara el
  // ID —no un booleano— para que las TRES transiciones cuenten: sin
  // pendiente→pendiente, pendiente→resuelto, y pendiente A→pendiente B (un
  // booleano no distingue la última y se tragaba al contacto nuevo).
  // Ajustar estado en el render es el patrón recomendado de React para
  // derivar de una prop, y evita el falso positivo de `set-state-in-effect`.
  const [pendientePrevio, setPendientePrevio] = useState(contactoPendienteId)
  if (pendientePrevio !== contactoPendienteId) {
    setPendientePrevio(contactoPendienteId)
    setPospuesto(false)
  }

  const desenlaceAbierto = contactoPendienteId !== null && !pospuesto

  useEffect(() => {
    // Detector de regreso: el asesor se fue a WhatsApp y volvió. La pestaña
    // no se remonta, así que sin esto la página seguiría mostrando el estado
    // de antes de salir. Se registra una sola vez y se limpia al desmontar.
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') {
        router.refresh()
      }
    }

    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [router])

  function alElegir(desenlace: DesenlaceElegible) {
    // «Agendé una cita» NO resuelve nada todavía: solo abre el formulario de
    // visita. El contacto se marca como 'cita' hasta `alAgendada`, o sea
    // cuando la visita se guardó de verdad. Si el asesor abandona el
    // formulario, el contacto sigue pendiente — porque no hubo cita.
    if (desenlace === 'cita') {
      // Con la visita deshabilitada su hoja ignoraría el open en silencio
      // (return temprano): mejor decir por qué y dejar el contacto pendiente.
      if (deshabilitadoMotivo) {
        toast.error(deshabilitadoMotivo)
        return
      }
      setPospuesto(true)
      setVisitaAbierta(true)
      return
    }

    iniciarTransicion(async () => {
      const resultado = await resolverContacto(leadId, desenlace, canalPendiente)

      if ('error' in resultado) {
        // La hoja se queda abierta: el desenlace no quedó registrado y el
        // asesor tiene que poder reintentar.
        toast.error(resultado.error)
        return
      }

      setPospuesto(true)
      router.refresh()

      // El siguiente paso natural tras reportar «contestó» / «no contestó»
      // es pactar CUÁNDO retomarlo (ronda 2). 'no_interesa' cierra el lead y
      // 'cita' ya agenda la visita — ahí no hay follow-up que pactar.
      if (desenlace === 'contesto' || desenlace === 'no_contesto') {
        sugerirRecordatorio(leadId)
      }
    })
  }

  function alAgendada() {
    // Único punto donde se resuelve a 'cita'. `HojaAgendarVisita` solo llama
    // aquí después de que `agendarVisita` respondió sin error.
    void resolverContacto(leadId, 'cita').then((resultado) => {
      if ('error' in resultado) {
        toast.error(resultado.error)
        return
      }
      router.refresh()
    })
  }

  const primerNombre = leadNombre.trim().split(/\s+/)[0] || 'este lead'

  return (
    <>
      {/* El botón de la rejilla: el mismo que traía `HojaAgendarVisita`
          antes de pasar a modo controlado. Deshabilitada, la hoja de visita
          pinta ELLA su lugar en la rejilla (el span gris del return
          temprano), así que aquí no va botón propio — habría dos. */}
      {deshabilitadoMotivo ? null : (
        <Button
          type="button"
          variant="outline"
          className="h-14 flex-col gap-1 rounded-xl bg-white text-xs font-medium"
          onClick={() => setVisitaAbierta(true)}
        >
          <CalendarClock aria-hidden className="size-5" />
          Agendar visita
        </Button>
      )}

      <HojaAgendarVisita
        {...propsVisita}
        deshabilitadoMotivo={deshabilitadoMotivo}
        open={visitaAbierta}
        onOpenChange={setVisitaAbierta}
        onAgendada={alAgendada}
      />

      <Sheet
        open={desenlaceAbierto}
        onOpenChange={(abrir) => {
          if (!abrir) setPospuesto(true)
        }}
      >
        <SheetContent
          side="bottom"
          className="mx-auto max-w-md rounded-t-2xl pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>¿Cómo te fue con {primerNombre}?</SheetTitle>
            <SheetDescription>
              {canalPendiente === 'llamada'
                ? 'Acabas de llamarle. Un toque y seguimos.'
                : 'Un toque y seguimos.'}
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-2 px-4 pb-4">
            {OPCIONES.map(({ desenlace, Icono }) => (
              <Button
                key={desenlace}
                type="button"
                variant="outline"
                size="lg"
                data-desenlace={desenlace}
                disabled={pendiente}
                onClick={() => alElegir(desenlace)}
                className="w-full justify-start gap-3 rounded-xl bg-white"
              >
                <Icono aria-hidden className="size-5 text-slate-500" />
                {etiquetaResultado(desenlace)}
              </Button>
            ))}

            <button
              type="button"
              data-desenlace="ahora-no"
              disabled={pendiente}
              onClick={() => setPospuesto(true)}
              className="mt-1 self-center text-sm text-slate-500 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Ahora no
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
